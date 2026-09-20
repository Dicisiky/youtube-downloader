import { readdirSync, statSync } from 'fs';
import { CookieIdentityPoolService } from './cookie-identity-pool.service';

jest.mock('fs', () => ({
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}));

const mockReaddirSync = readdirSync as jest.Mock;
const mockStatSync = statSync as jest.Mock;

function makeConfig(values: Record<string, unknown>) {
  return { get: (key: string) => values[key] };
}

describe('CookieIdentityPoolService', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  function discover(values: Record<string, unknown>) {
    const pool = new CookieIdentityPoolService(makeConfig(values) as any);
    pool.onModuleInit();
    return pool;
  }

  it('discovers one identity per subdirectory of the plural pool dir', () => {
    mockReaddirSync.mockReturnValue(['2', '1']);
    mockStatSync.mockReturnValue({ isDirectory: () => true });

    const pool = discover({ 'ytdlp.browserProfilesDir': '/secrets/chrome-profiles' });

    expect(pool.listIdentities()).toEqual(['/secrets/chrome-profiles/1', '/secrets/chrome-profiles/2']);
  });

  it('falls back to the single legacy profile dir when the plural dir is not configured', () => {
    const pool = discover({ 'ytdlp.browserProfileDir': '/secrets/chrome-profile' });
    expect(pool.listIdentities()).toEqual(['/secrets/chrome-profile']);
  });

  it('falls back to the single legacy profile dir when the plural dir exists but is empty', () => {
    mockReaddirSync.mockReturnValue([]);
    const pool = discover({
      'ytdlp.browserProfilesDir': '/secrets/chrome-profiles',
      'ytdlp.browserProfileDir': '/secrets/chrome-profile',
    });
    expect(pool.listIdentities()).toEqual(['/secrets/chrome-profile']);
  });

  it('returns no identity when nothing is configured at all', () => {
    const pool = discover({});
    expect(pool.listIdentities()).toEqual([]);
    expect(pool.acquireForJob('job-1')).toBeUndefined();
    expect(pool.acquireForCheck()).toBeUndefined();
  });

  describe('with a 2-identity pool', () => {
    function makePool() {
      mockReaddirSync.mockReturnValue(['1', '2']);
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      return discover({ 'ytdlp.browserProfilesDir': '/secrets/chrome-profiles' });
    }

    it('gives two concurrent jobs two different identities', () => {
      const pool = makePool();
      const a = pool.acquireForJob('job-a');
      const b = pool.acquireForJob('job-b');
      expect(a).not.toEqual(b);
    });

    it('keeps returning the same identity for the same job across its whole lifetime', () => {
      const pool = makePool();
      const first = pool.acquireForJob('job-a');
      pool.acquireForJob('job-b');
      const again = pool.acquireForJob('job-a');
      expect(again).toEqual(first);
    });

    it('lets getForJob look up what a job already holds without assigning a new one', () => {
      const pool = makePool();
      expect(pool.getForJob('job-a')).toBeUndefined();
      const assigned = pool.acquireForJob('job-a');
      expect(pool.getForJob('job-a')).toEqual(assigned);
    });

    it('frees an identity on release so a later job can reuse it', () => {
      const pool = makePool();
      const a = pool.acquireForJob('job-a');
      pool.acquireForJob('job-b');
      pool.releaseJob('job-a');
      const c = pool.acquireForJob('job-c');
      expect(c).toEqual(a);
      expect(pool.getForJob('job-a')).toBeUndefined();
    });

    it('degrades to sharing the least-loaded identity once every identity is already taken, instead of blocking', () => {
      const pool = makePool();
      const a = pool.acquireForJob('job-a');
      const b = pool.acquireForJob('job-b');
      const overflow = pool.acquireForJob('job-c');
      expect([a, b]).toContain(overflow);
    });

    it('round-robins ad-hoc checks across the whole pool', () => {
      const pool = makePool();
      const identities = pool.listIdentities();
      const seen = [pool.acquireForCheck(), pool.acquireForCheck(), pool.acquireForCheck()];
      expect(seen).toEqual([identities[0], identities[1], identities[0]]);
    });
  });
});
