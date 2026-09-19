import { YoutubeLiveService } from './youtube-live.service';

function makeService() {
  const config = { get: jest.fn().mockReturnValue(undefined) };
  return new YoutubeLiveService(config as any);
}

describe('YoutubeLiveService.getActiveLiveBroadcast retry wrapper', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a transient failure and returns the result once the shared profile lock clears', async () => {
    jest.useFakeTimers();
    const service = makeService();
    const checkOnce = jest
      .spyOn(service as any, 'checkLiveOnce')
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValueOnce({ videoId: 'abc', title: 'Live now' });

    const resultPromise = service.getActiveLiveBroadcast('UC_test');
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).resolves.toEqual({ videoId: 'abc', title: 'Live now' });
    expect(checkOnce).toHaveBeenCalledTimes(3);
  });

  it('gives up and surfaces the error once the retry budget is exhausted', async () => {
    jest.useFakeTimers();
    const service = makeService();
    const checkOnce = jest.spyOn(service as any, 'checkLiveOnce').mockRejectedValue(new Error('database is locked'));

    const resultPromise = service.getActiveLiveBroadcast('UC_test');
    resultPromise.catch(() => {}); // avoid an unhandled-rejection warning while timers advance below
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).rejects.toThrow('database is locked');
    expect(checkOnce).toHaveBeenCalledTimes(3);
  });

  it('does not retry a confirmed "not live" result', async () => {
    const service = makeService();
    const checkOnce = jest.spyOn(service as any, 'checkLiveOnce').mockResolvedValue(null);

    await expect(service.getActiveLiveBroadcast('UC_test')).resolves.toBeNull();
    expect(checkOnce).toHaveBeenCalledTimes(1);
  });

  it('fails fast on a rate-limit error instead of retrying on the fast cadence', async () => {
    const service = makeService();
    const checkOnce = jest
      .spyOn(service as any, 'checkLiveOnce')
      .mockRejectedValue(new Error('ERROR: [youtube] abc: The page needs to be reloaded.'));

    await expect(service.getActiveLiveBroadcast('UC_test')).rejects.toThrow('The page needs to be reloaded');
    // Exactly one attempt -- retrying immediately against a rate limit only
    // adds to the budget that's already exhausted.
    expect(checkOnce).toHaveBeenCalledTimes(1);
  });
});
