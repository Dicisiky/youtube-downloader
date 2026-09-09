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
  },
  poll: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '60000', 10),
  },
});
