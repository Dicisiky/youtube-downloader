import { isRateLimited } from './ytdlp-errors.util';

describe('isRateLimited', () => {
  it('matches the generic error yt-dlp surfaces for a 429 once --no-warnings hides the real line', () => {
    expect(isRateLimited('ERROR: [youtube] abc123: The page needs to be reloaded.')).toBe(true);
  });

  it('matches an explicit 429 / "too many requests" message', () => {
    expect(isRateLimited('Failed to download m3u8 information: HTTP Error 429: Too Many Requests')).toBe(true);
  });

  it('does not match an ordinary, unrelated extraction error', () => {
    expect(isRateLimited('ERROR: [youtube] abc123: Video unavailable')).toBe(false);
  });
});
