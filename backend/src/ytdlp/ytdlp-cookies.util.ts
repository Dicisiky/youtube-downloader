import { randomUUID } from 'crypto';
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * yt-dlp treats its cookies file as mutable session state, rewriting it on
 * exit as tokens refresh. Handing every concurrent yt-dlp invocation the SAME
 * file causes a race -- one process's write can corrupt/desync the session
 * mid-flight for every other one running at the same time (two concurrent
 * recordings plus the poll loop sharing one cookies.txt broke the session for
 * all of them the first time this ran). Giving each invocation an isolated
 * snapshot avoids that, at the cost of not persisting yt-dlp's own in-session
 * cookie refreshes -- an acceptable tradeoff since a real browser-exported
 * session cookie stays valid on its own for a long time regardless.
 */
export function snapshotCookiesFile(configuredPath: string | undefined): string | undefined {
  if (!configuredPath || !existsSync(configuredPath)) return undefined;
  const snapshotPath = join(tmpdir(), `ytdlp-cookies-${randomUUID()}.txt`);
  copyFileSync(configuredPath, snapshotPath);
  return snapshotPath;
}

export function cleanupCookiesSnapshot(snapshotPath: string | undefined): void {
  if (!snapshotPath) return;
  try {
    unlinkSync(snapshotPath);
  } catch {
    /* best-effort cleanup, not fatal if it's already gone */
  }
}
