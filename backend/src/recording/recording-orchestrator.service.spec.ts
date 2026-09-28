import { RecordingOrchestratorService, MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES } from './recording-orchestrator.service';
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
  const identityPool = { getForJob: jest.fn().mockReturnValue(undefined), listIdentities: jest.fn().mockReturnValue([]) };

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
    identityPool as any,
    upload as any,
    youtubeLive as any,
    jobs as any,
    events as any,
  );

  return { orchestrator: orchestrator as any, prisma, ytdlp, identityPool, upload, youtubeLive, jobs, events };
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

    // One more clean exit than the budget allows, with an unresolvable check
    // every time, should stop leaning on "assume live".
    for (let i = 0; i < MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES + 1; i++) {
      await orchestrator.handleRecordingExit(
        channel,
        'job-1',
        { success: true, filePath: `/recordings/seg-${i}.mp4`, reason: 'stream_ended' },
        recordingOptions,
      );
    }

    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES);
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

    // The budget's worth of continuations is allowed; one crash beyond that
    // exhausts it.
    for (let i = 0; i < MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES + 1; i++) {
      await orchestrator.handleRecordingExit(
        channel,
        'job-1',
        { success: false, filePath: '', reason: 'failed', error: 'yt-dlp exhausted its local restarts' },
        recordingOptions,
      );
    }

    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES);
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

    for (let i = 0; i < MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES + 1; i++) {
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

  it("re-checks a channel using the job's own already-assigned cookie identity, not a different one from the pool", async () => {
    const { orchestrator, youtubeLive, identityPool } = makeHarness();
    identityPool.getForJob.mockReturnValue('/secrets/chrome-profiles/2');
    youtubeLive.getActiveLiveBroadcast.mockResolvedValue(null);

    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: true, filePath: '/recordings/seg0.mp4', reason: 'stream_ended' },
      { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' },
    );

    expect(identityPool.getForJob).toHaveBeenCalledWith('job-1');
    expect(youtubeLive.getActiveLiveBroadcast).toHaveBeenCalledWith('UC_test', '/secrets/chrome-profiles/2');
  });

  it('falls back to another pool identity when the job\'s own identity is the one that\'s blocked, instead of fragmenting', async () => {
    const { orchestrator, ytdlp, upload, youtubeLive, identityPool } = makeHarness();
    identityPool.getForJob.mockReturnValue('/secrets/chrome-profiles/2');
    identityPool.listIdentities.mockReturnValue(['/secrets/chrome-profiles/1', '/secrets/chrome-profiles/2', '/secrets/chrome-profiles/3']);
    // Identity 2 (this job's own) is bot-blocked; identity 3 is healthy and
    // confirms the broadcast is still the same one.
    youtubeLive.getActiveLiveBroadcast.mockImplementation((_channelId: string, identity?: string) => {
      if (identity === '/secrets/chrome-profiles/2') return Promise.reject(new Error("Sign in to confirm you're not a bot"));
      return Promise.resolve({ videoId: 'video-1', title: 'Live now' });
    });

    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: true, filePath: '/recordings/seg0.mp4', reason: 'stream_ended' },
      { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' },
    );

    expect(youtubeLive.getActiveLiveBroadcast).toHaveBeenCalledWith('UC_test', '/secrets/chrome-profiles/2');
    expect(youtubeLive.getActiveLiveBroadcast).toHaveBeenCalledWith('UC_test', '/secrets/chrome-profiles/1');
    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(1);
    expect(ytdlp.finalizeSegments).not.toHaveBeenCalled();
    expect(upload.upload).not.toHaveBeenCalled();
  });

  it('only treats liveness as unknown once every identity in the pool has failed', async () => {
    const { orchestrator, ytdlp, upload, jobs, youtubeLive, identityPool } = makeHarness();
    identityPool.getForJob.mockReturnValue('/secrets/chrome-profiles/2');
    identityPool.listIdentities.mockReturnValue(['/secrets/chrome-profiles/1', '/secrets/chrome-profiles/2']);
    youtubeLive.getActiveLiveBroadcast.mockRejectedValue(CONTENTION_ERROR);

    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: true, filePath: '/recordings/seg0.mp4', reason: 'stream_ended' },
      { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' },
    );

    expect(youtubeLive.getActiveLiveBroadcast).toHaveBeenCalledTimes(2);
    expect(ytdlp.continueSegment).toHaveBeenCalledTimes(1);
    expect(jobs.incrementRetryCount).toHaveBeenCalledWith('job-1');
    expect(upload.upload).not.toHaveBeenCalled();
  });

  it('marks the job FAILED and resets the channel instead of getting stuck when merging segments throws', async () => {
    // Reproduces the 2026-09-28 incident: ffmpeg's concat crashed on a
    // corrupted segment boundary, the throw wasn't caught anywhere in the
    // finalize path, and the job/channel were left at PROCESSING/RECORDING
    // forever -- MonitorService skips polling any channel with an "active"
    // job, so that silently stopped monitoring the channel for every future
    // stream too, not just the one that failed.
    const { orchestrator, ytdlp, upload, jobs, prisma, events, youtubeLive } = makeHarness();
    youtubeLive.getActiveLiveBroadcast.mockResolvedValue(null);
    ytdlp.finalizeSegments.mockRejectedValue(new Error('ffmpeg concat failed: Invalid data found when processing input'));

    await orchestrator.handleRecordingExit(
      makeChannel(),
      'job-1',
      { success: true, filePath: '/recordings/seg0.mp4', reason: 'stream_ended' },
      { jobId: 'job-1', videoId: 'video-1', channelSlug: 'Test Channel' },
    );

    expect(upload.upload).not.toHaveBeenCalled();
    expect(jobs.updateStatus).toHaveBeenCalledWith(
      'job-1',
      JobStatus.FAILED,
      expect.objectContaining({ errorMessage: expect.stringContaining('segment merge failed') }),
    );
    expect(prisma.monitoredChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recordingStatus: 'ERROR', currentVideoId: null }) }),
    );
    expect(ytdlp.clearSegments).toHaveBeenCalledWith('job-1');
    expect(events.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'channel.updated' }));
  });
});
