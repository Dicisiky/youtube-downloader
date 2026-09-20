import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Pool of independent, already-logged-in Chromium profiles ("identities"),
 * one per subdirectory of ytdlp.browserProfilesDir. A recording job is
 * assigned one identity for its ENTIRE lifetime (every segment/restart of
 * that job reuses it) so concurrent recordings never share one Google
 * account's YouTube rate-limit budget with each other -- see
 * MANAGING-COOKIE-IDENTITIES.md for how to add a new one.
 *
 * Falls back to a single-identity pool backed by the legacy
 * ytdlp.browserProfileDir value when the plural dir isn't configured (or
 * can't be read), so an un-migrated deployment behaves exactly as before.
 */
@Injectable()
export class CookieIdentityPoolService implements OnModuleInit {
  private readonly logger = new Logger(CookieIdentityPoolService.name);
  private identities: string[] = [];
  private readonly assignedToJob = new Map<string, string>(); // jobId -> identity
  private readonly holderCount = new Map<string, number>(); // identity -> concurrent holders
  private roundRobinCursor = 0;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.identities = this.discoverIdentities();
    if (this.identities.length === 0) {
      this.logger.warn('no cookie identity configured -- yt-dlp will run without --cookies-from-browser/--cookies');
    } else {
      this.logger.log(
        `cookie identity pool ready with ${this.identities.length} identit${this.identities.length === 1 ? 'y' : 'ies'}`,
      );
    }
  }

  private discoverIdentities(): string[] {
    const poolDir = this.config.get<string>('ytdlp.browserProfilesDir');
    if (poolDir) {
      try {
        const identities = readdirSync(poolDir)
          .filter((name) => statSync(join(poolDir, name)).isDirectory())
          .sort()
          .map((name) => join(poolDir, name));
        if (identities.length > 0) return identities;
        this.logger.warn(`${poolDir} has no identity subdirectories yet, falling back to the single-profile setting`);
      } catch (err) {
        this.logger.error(`could not read profile pool dir ${poolDir}, falling back to the single-profile setting`, err as Error);
      }
    }
    const single = this.config.get<string>('ytdlp.browserProfileDir');
    return single ? [single] : [];
  }

  /**
   * Assigns an identity to a job, sticky for its whole lifetime -- calling
   * this again for the same jobId (e.g. on every segment continuation)
   * returns the same identity rather than reshuffling mid-recording.
   * Prefers an identity nothing else currently holds; if every identity is
   * already in use (more concurrent jobs than provisioned identities), falls
   * back to the least-loaded one instead of blocking the recording -- those
   * jobs share, exactly like the old single-identity behavior, only for the
   * overflow beyond what's been provisioned.
   */
  acquireForJob(jobId: string): string | undefined {
    const existing = this.assignedToJob.get(jobId);
    if (existing) return existing;
    if (this.identities.length === 0) return undefined;

    let best = this.identities[0];
    let bestLoad = this.holderCount.get(best) ?? 0;
    for (const identity of this.identities) {
      const load = this.holderCount.get(identity) ?? 0;
      if (load < bestLoad) {
        best = identity;
        bestLoad = load;
      }
    }
    this.assignedToJob.set(jobId, best);
    this.holderCount.set(best, bestLoad + 1);
    if (bestLoad > 0) {
      this.logger.warn(
        `[${jobId}] no free cookie identity -- sharing "${best}" with ${bestLoad} other active job(s); add another identity to the pool to avoid this`,
      );
    }
    return best;
  }

  /** What a job is already using, if anything -- for a re-check on that job's own channel, which should ride the same identity rather than borrowing another one from the pool. */
  getForJob(jobId: string): string | undefined {
    return this.assignedToJob.get(jobId);
  }

  /** Call once a job has truly finished (finalized or failed for good) to free its identity back to the pool. */
  releaseJob(jobId: string): void {
    const identity = this.assignedToJob.get(jobId);
    if (!identity) return;
    this.assignedToJob.delete(jobId);
    const load = (this.holderCount.get(identity) ?? 1) - 1;
    if (load <= 0) this.holderCount.delete(identity);
    else this.holderCount.set(identity, load);
  }

  /** For one-off checks not tied to a specific job's recording (e.g. polling a channel that isn't currently being recorded) -- round-robins across the pool since these are brief and don't need exclusivity. */
  acquireForCheck(): string | undefined {
    if (this.identities.length === 0) return undefined;
    const identity = this.identities[this.roundRobinCursor % this.identities.length];
    this.roundRobinCursor++;
    return identity;
  }

  listIdentities(): string[] {
    return [...this.identities];
  }
}
