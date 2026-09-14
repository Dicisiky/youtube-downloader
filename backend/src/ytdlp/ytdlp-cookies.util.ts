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

export interface CookieSourceConfig {
  /** Directory of a persistent, logged-in Chromium profile. Takes priority when set. */
  browserProfileDir?: string;
  /** Netscape-format cookies.txt path. Fallback used only when browserProfileDir is unset. */
  cookiesFile?: string;
}

export interface ResolvedCookieArgs {
  /** yt-dlp CLI args to splice in, or [] if no cookie source is configured. */
  args: string[];
  /** Must be called in a `finally` once the yt-dlp invocation finishes. */
  cleanup: () => void;
}

/**
 * Picks between the two cookie sources yt-dlp can use, preferring the
 * browser profile: yt-dlp reads a browser's own cookie store read-only, so
 * unlike the file-based path there's no rewrite race between concurrent
 * invocations and no snapshot/cleanup needed -- the session self-refreshes
 * the same way it would in an actual browser instead of going stale like a
 * one-time exported cookies.txt.
 */
export function resolveCookieArgs(config: CookieSourceConfig): ResolvedCookieArgs {
  if (config.browserProfileDir && existsSync(config.browserProfileDir)) {
    // yt-dlp treats an absolute --cookies-from-browser path as the PROFILE
    // dir itself (expects Cookies directly inside it), not the browser's
    // top-level user-data-dir -- so the configured dir needs the "Default"
    // profile segment appended, one level down from where the login/copy
    // step actually put the profile.
    const profilePath = join(config.browserProfileDir, 'Default');
    return {
      args: ['--cookies-from-browser', `chromium:${profilePath}`],
      cleanup: () => {},
    };
  }

  const cookiesSnapshot = snapshotCookiesFile(config.cookiesFile);
  return {
    args: cookiesSnapshot ? ['--cookies', cookiesSnapshot] : [],
    cleanup: () => cleanupCookiesSnapshot(cookiesSnapshot),
  };
}
