import { RecordingOrchestratorService } from './recording-orchestrator.service';
import { JobStatus } from '../common/enums';

/**
 * Reproduces the 2026-09-18/19 incidents: several channels recording at once,
 * all sharing one cookie-profile-backed liveness check. When that shared
 * check gets flaky or rate-limited under concurrent load, a healthy
 * still-live broadcast must keep recording as ONE job -- not get
 * finalized/uploaded as a truncated clip that YouTube then sees as several
 * separate videos -- and a job that truly runs out of road should still try
 * to salvage whatever it captured rather than abandoning it on disk.
 */

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'channel-1',
    channelId: 'UC_test',
    channelTitle: 'Test Channel',
    channelUrl: 'https://www.youtube.com/channel/UC_test',
    isActive: true,
    defaultVisibility: 'UNLISTED',
    titleTemplate: '{channelTitle} - {originalTitle} ({date})',
    uploadConfigId: 'cfg-1',
    playlistId: null,
    ...overrides,
  } as any;
}

/** In-memory stand-in for the RecordingJob row's persisted retryCount, keyed by jobId. */
function makeHarness() {
  const jobRows = new Map<string, { id: string; retryCount: number; sourceTitle: string }>();
  const rowFor = (id: string) => {
    if (!jobRows.has(id)) jobRows.set(id, { id, retryCount: 0, sourceTitle: 'Live now' });
    return jobRows.get(id)!;
  };

  const prisma = {
    recordingJob: {
      findUnique: jest.fn().mockImplementation(({ where: { id } }: any) => Promise.resolve({ ...rowFor(id) })),
    },
    monitoredChannel: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
    },
  };

  const ytdlp = {
    start: jest.fn(),
    continueSegment: jest.fn(),
    finalizeSegments: jest.fn().mockResolvedValue('/recordings/final.mp4'),
    clearSegments: jest.fn(),
  };

  const upload = { upload: jest.fn().mockResolvedValue('uploaded-video-id') };
  const youtubeLive = { getActiveLiveBroadcast: jest.fn() };

  const jobs = {
    create: jest.fn(),
    updateStatus: jest.fn().mockImplementation((id: string, status: unknown) => Promise.resolve({ id, status, sourceTitle: 'Live now' })),
    incrementRetryCount: jest.fn().mockImplementation((id: string) => {
      const row = rowFor(id);
      row.retryCount += 1;
      return Promise.resolve({ ...row });
    }),
  };

  const events = { broadcast: jest.fn() };

  const orchestrator = new RecordingOrchestratorService(
    prisma as any,
    ytdlp as any,
    upload as any,
    youtubeLive as any,
    jobs as any,
    events as any,
  );

  return { orchestrator: orchestrator as any, prisma, ytdlp, upload, youtubeLive, jobs, events };
}

const CONTENTION_ERROR = new Error('cookie database is locked');

describe('RecordingOrchestratorService - liveness re-check under contention', () => {
  it('continues recording as one job when the re-check is flaky, instead of uploading a truncated clip', async () => {
    const { orchestrator, ytdlp, upload, jobs, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);

    const recordingOptions = { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' };
    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: true, filePath: '/recordings/seg0.mp4', reason: 'stream_ended' },
      recordingOptions,
    );

    expect(ytdlp.continueSegment).toHaveBeenCalledWith(recordingOptions);
    expect(ytdlp.finalizeSegments).not.toHaveBeenCalled();
    expect(upload.upload).not.toHaveBeenCalled();
    expect(jobs.incrementRetryCount).toHaveBeenCalledWith('job-1');
  });

  it('does not fragment any of several channels recording simultaneously against the same flaky check', async () => {
    const { orchestrator, ytdlp, upload, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);

    const channelTitles = ['Mr.Bandit', 'Austriacul Adrian', 'Ceaurel', 'Gabitzu'];
    await Promise.all(
      channelTitles.map((title, i) =>
        orchestrator.handleRecordingExit(
          makeChannel({ id: `channel-${i}`, channelId: `UC_${i}`, channelTitle: title }),
          `job-${i}`,
          { success: true, filePath: `/recordings/seg-${i}.mp4`, reason: 'stream_ended' },
          { jobId: `job-${i}`, videoId: `video-${i}`, channelSlug: title },
        ),
      ),
    );

    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(channelTitles.length);
    expect(upload.upload).not.toHaveBeenCalled();
  });

  it('still finalizes eventually if the re-check never resolves, instead of retrying forever', async () => {
    const { orchestrator, ytdlp, upload, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);

    const channel = makeChannel();
    const recordingOptions = { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' };

    // MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES is 5 -- a 6th clean exit in a
    // row with an unresolvable check should stop leaning on "assume live".
    for (let i = 0; i < 6; i++) {
      await orchestrator.handleRecordingExit(
        channel,
        'job-1',
        { success: true, filePath: `/recordings/seg-${i}.mp4`, reason: 'stream_ended' },
        recordingOptions,
      );
    }

    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(5);
    expect(ytdlp.finalizeSegments).toHaveBeenCalledTimes(1);
    expect(upload.upload).toHaveBeenCalledTimes(1);
  });

  it('finalizes immediately when the broadcast is confirmed to have actually ended', async () => {
    const { orchestrator, ytdlp, upload, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockResolvedValue(null);

    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: true, filePath: '/recordings/seg0.mp4', reason: 'stream_ended' },
      { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' },
    );

    expect(ytdlp.continueSegment).not.toHaveBeenCalled();
    expect(ytdlp.finalizeSegments).toHaveBeenCalledTimes(1);
    expect(upload.upload).toHaveBeenCalledTimes(1);
  });

  it('continues instead of failing the job when yt-dlp exhausts its restarts but liveness is unknown', async () => {
    const { orchestrator, ytdlp, jobs, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);

    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: false, filePath: '', reason: 'failed', error: 'yt-dlp exhausted its local restarts' },
      { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' },
    );

    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(1);
    expect(jobs.updateStatus).not.toHaveBeenCalledWith('job-1', JobStatus.FAILED, expect.anything());
  });

  it('salvages and uploads whatever was captured once the continuation budget runs out on repeated crashes', async () => {
    const { orchestrator, ytdlp, upload, jobs, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);

    const channel = makeChannel();
    const recordingOptions = { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' };

    // 5 continuations allowed; the 6th crash in a row exhausts the budget.
    for (let i = 0; i < 6; i++) {
      await orchestrator.handleRecordingExit(
        channel,
        'job-1',
        { success: false, filePath: '', reason: 'failed', error: 'yt-dlp exhausted its local restarts' },
        recordingOptions,
      );
    }

    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(5);
    expect(ytdlp.finalizeSegments).toHaveBeenCalledTimes(1);
    expect(upload.upload).toHaveBeenCalledTimes(1);
    expect(jobs.updateStatus).toHaveBeenCalledWith('job-1', JobStatus.COMPLETED, expect.anything());
    expect(jobs.updateStatus).not.toHaveBeenCalledWith('job-1', JobStatus.FAILED, expect.anything());
  });

  it('still fails the job when the continuation budget runs out and there is truly nothing on disk to salvage', async () => {
    const { orchestrator, ytdlp, upload, jobs, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);
    ytdlp.finalizeSegments.mockResolvedValue(null);

    const channel = makeChannel();
    const recordingOptions = { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' };

    for (let i = 0; i < 6; i++) {
      await orchestrator.handleRecordingExit(
        channel,
        'job-1',
        { success: false, filePath: '', reason: 'failed', error: 'yt-dlp exhausted its local restarts' },
        recordingOptions,
      );
    }

    expect(upload.upload).not.toHaveBeenCalled();
    expect(jobs.updateStatus).toHaveBeenCalledWith('job-1', JobStatus.FAILED, expect.anything());
  });
});
