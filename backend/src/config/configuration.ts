export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
    loginRedirectUri: process.env.GOOGLE_LOGIN_REDIRECT_URI ?? '',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    adminEmail: (process.env.ADMIN_EMAIL ?? '').toLowerCase(),
  },
  ytdlp: {
    binaryPath: process.env.YTDLP_PATH ?? 'yt-dlp.exe',
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg.exe',
    recordingsDir: process.env.RECORDINGS_DIR ?? 'storage/recordings',
    // Path to a Netscape-format cookies.txt from a real logged-in YouTube
    // session. Optional locally, but needed on cloud/datacenter IPs (VPS
    // providers) where YouTube's bot-detection challenges anonymous requests
    // with "Sign in to confirm you're not a bot".
    // Fallback only -- used when browserProfileDir isn't set. A static
    // exported file doesn't self-refresh, so it eventually goes stale.
    cookiesFile: process.env.YTDLP_COOKIES_FILE ?? '',
    // Directory of a persistent, already-logged-in Chromium profile. When
    // set, takes priority over cookiesFile: yt-dlp reads cookies live from
    // this profile's own cookie store via --cookies-from-browser, so the
    // session keeps rotating/refreshing itself the same way it would in a
    // real browser, instead of going stale like a one-time exported file.
    browserProfileDir: process.env.YTDLP_BROWSER_PROFILE_DIR ?? '',
  },
  poll: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '60000', 10),
  },
});
