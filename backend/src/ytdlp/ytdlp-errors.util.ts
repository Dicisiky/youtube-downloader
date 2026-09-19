/**
 * True if yt-dlp's output indicates YouTube is rate-limiting this identity
 * (HTTP 429) rather than a one-off network/extraction hiccup. A rate limit
 * needs a real cool-down -- retrying against it on the same few-second cadence
 * used for transient errors just adds more requests to the exact budget
 * that's already exhausted, which prolongs the block instead of clearing it.
 *
 * "The page needs to be reloaded" is included deliberately, not just the
 * literal 429 text: every yt-dlp invocation here runs with --no-warnings,
 * which suppresses the WARNING line that actually names the 429 -- only this
 * generic follow-on ERROR survives to stderr. Confirmed by hand (dropping
 * --no-warnings) that this exact message is what a 429 looks like once
 * warnings are suppressed, for this app's traffic pattern.
 */
export function isRateLimited(message: string): boolean {
  return /\b429\b|too many requests|the page needs to be reloaded/i.test(message);
}
