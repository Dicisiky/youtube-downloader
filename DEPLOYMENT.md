# Livestream Archiver — Windows Deployment Guide

Stack: NestJS (backend, background worker + WebSocket + REST) · Next.js App Router (frontend) · PostgreSQL + Prisma · yt-dlp · YouTube Data API v3 (OAuth2).

All commands below are for **native Windows** (Command Prompt or PowerShell) — no WSL.

---

## 0. Prerequisites

Install these first:

| Tool | Check | Get it |
|---|---|---|
| Node.js 20 LTS | `node -v` | https://nodejs.org |
| PostgreSQL 16 | `psql --version` | https://www.postgresql.org/download/windows/ |
| Git | `git --version` | https://git-scm.com |
| yt-dlp.exe | `yt-dlp --version` | https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe |
| ffmpeg.exe | `ffmpeg -version` | https://www.gyan.dev/ffmpeg/builds/ (release "full" build) |

Put `yt-dlp.exe` and `ffmpeg.exe` somewhere permanent, e.g. `C:\tools\yt-dlp\` and `C:\tools\ffmpeg\bin\`, and add both folders to your **System PATH** (Settings → System → About → Advanced system settings → Environment Variables → Path → New).

Verify in a **new** terminal window (PATH changes need a fresh shell):

```bat
yt-dlp --version
ffmpeg -version
node -v
```

---

## 1. PostgreSQL database

Open "SQL Shell (psql)" (installed with PostgreSQL) or use `psql` from a terminal, connect as the `postgres` superuser, then:

```sql
CREATE DATABASE yt_livestream;
CREATE USER yt_app WITH PASSWORD 'change-me';
GRANT ALL PRIVILEGES ON DATABASE yt_livestream TO yt_app;
```

Keep the connection string handy: `postgresql://yt_app:change-me@localhost:5432/yt_livestream?schema=public`

---

## 2. Google Cloud OAuth2 setup (YouTube Data API v3)

1. Go to https://console.cloud.google.com/ and create a project (e.g. "livestream-archiver").
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → Credentials → Create Credentials → API key**. Restrict it to "YouTube Data API v3". This is `YOUTUBE_API_KEY` — used for read-only polling of the *monitored* (source) channels' live status, no OAuth needed for that side.
4. **APIs & Services → OAuth consent screen**: choose "External" (or "Internal" if using Workspace), fill in app name/support email, add scope `.../auth/youtube.upload` and `.../auth/youtube.readonly`, and add the Google account(s) you'll authorize as uploaders under "Test users" (required while the app is unpublished/in testing).
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type **Web application**. Add an authorized redirect URI:
   `http://localhost:4000/auth/youtube/callback`
   (swap the host/port for your production domain later — see §8).
6. Copy the generated **Client ID** and **Client Secret** — these become `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

---

## 3. Clone/prepare the project

The codebase already exists at `E:\youtube-downloader` with two apps:

```
E:\youtube-downloader\
  backend\    NestJS API + background worker + WebSocket
  frontend\   Next.js dashboard
  storage\recordings\   local disk storage for in-progress/finished recordings
```

---

## 4. Backend setup

```bat
cd E:\youtube-downloader\backend
npm install
copy .env.example .env
```

Edit `backend\.env` with your real values:

```
DATABASE_URL="postgresql://yt_app:change-me@localhost:5432/yt_livestream?schema=public"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
YOUTUBE_API_KEY="AIza..."
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="...."
GOOGLE_REDIRECT_URI="http://localhost:4000/auth/youtube/callback"
YTDLP_PATH="yt-dlp.exe"
FFMPEG_PATH="ffmpeg.exe"
RECORDINGS_DIR="E:\\youtube-downloader\\storage\\recordings"
POLL_INTERVAL_MS=60000
```

> If `yt-dlp.exe`/`ffmpeg.exe` are on PATH, the bare filenames above are enough. Otherwise use full paths, e.g. `C:\\tools\\yt-dlp\\yt-dlp.exe` (double backslashes in `.env` are not required by dotenv, but are shown here for clarity when copy-pasting into other Windows configs).

Generate the Prisma client and run the first migration:

```bat
npx prisma generate
npx prisma migrate dev --name init
```

Run the backend in dev mode:

```bat
npm run start:dev
```

You should see:
```
[bootstrap] backend listening on http://localhost:4000
```

---

## 5. Frontend setup

Open a **second** terminal:

```bat
cd E:\youtube-downloader\frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Open http://localhost:3000 — you should see the "Livestream Archiver" dashboard.

---

## 6. First-run walkthrough

1. On the dashboard, under **Upload destinations**, type a label (e.g. "Main Archive") and click **Authorize with Google**. You'll be redirected through Google's consent screen (log in with the account that owns the destination channel), then bounced back to the dashboard. The authorized channel now appears in the list — its OAuth tokens are stored in the `UploadConfig` table.
2. Click **+ Add channel**, paste a YouTube channel URL (`https://www.youtube.com/@handle` or `/channel/UC...`), pick the upload destination and default visibility, and Save.
   - If that channel is live *right now*, recording starts immediately (mid-stream capture) — you'll see its status flip to `LIVE` / `RECORDING` within a couple seconds.
   - Otherwise it sits in `IDLE` and the background poller (every `POLL_INTERVAL_MS`, default 60s) checks it automatically.
3. Watch the **Activity log** panel and the per-channel status badge for `RECORDING → PROCESSING → UPLOADING → COMPLETED`.
4. Finished recordings are re-uploaded to the destination channel with the configured visibility; the resulting `destinationVideoId` is stored on the `RecordingJob` row (visible via `GET /recording-jobs`).

---

## 7. How the pipeline works (for operators)

- **Polling**: `MonitorService` (backend/src/monitor/monitor.service.ts) ticks every `POLL_INTERVAL_MS` and calls the YouTube Data API (`search.list?eventType=live`) for each active `MonitoredChannel`.
- **Mid-stream edge case**: `ChannelsService.create` performs the same live check synchronously right after inserting the channel row, so a channel added while already live starts recording in that same request — it does not wait for the next poll tick.
- **Recording**: `YtdlpManagerService` spawns `yt-dlp.exe` against the live watch URL with `--hls-use-mpegts` (keeps the output file valid MPEG-TS even if the process is killed mid-stream) and infinite fragment/connection retries for transient network drops. If the whole process dies unexpectedly, it's automatically respawned (up to 5 times) against the same video ID.
- **Auto-stop**: when the stream actually ends, `yt-dlp` exits with code 0 on its own — no manual stop needed. Pausing a channel (or deleting it) force-stops any active recording.
- **Upload**: `YoutubeUploadService` streams the finished file to `videos.insert` using the destination channel's stored OAuth2 tokens, auto-refreshing the access token via the stored refresh token when expired.
- **Real-time UI**: every state transition is pushed over a WebSocket (`/ws`) by `EventsGateway`; the frontend's `useLiveStatus` hook patches its local state in place — no polling from the browser.

---

## 8. Production build & run (Windows, with PM2)

### 8.1 Build both apps

```bat
cd E:\youtube-downloader\backend
npm run build

cd E:\youtube-downloader\frontend
npm run build
```

### 8.2 Update `.env` for production

- Point `GOOGLE_REDIRECT_URI` at your real domain, e.g. `https://archiver.example.com/api/auth/youtube/callback`, and add that exact URI to the OAuth client's "Authorized redirect URIs" in Google Cloud Console.
- Set `CORS_ORIGIN` to your production frontend origin.
- Use a real PostgreSQL password and consider a managed/production Postgres instance.
- Set `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` in `frontend\.env.local` to your production backend URL (`https://...` / `wss://...`) — **rebuild the frontend** after changing these, since `NEXT_PUBLIC_*` vars are inlined at build time.

Apply pending Prisma migrations without the interactive dev flow:

```bat
cd E:\youtube-downloader\backend
npx prisma migrate deploy
```

### 8.3 Install PM2 (process manager) globally

```bat
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

`pm2-windows-startup` registers PM2 to relaunch your processes after a reboot (PM2's native `pm2 startup` targets systemd/launchd and doesn't work on Windows).

### 8.4 Create an ecosystem file

`E:\youtube-downloader\ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'ytarchiver-backend',
      cwd: 'E:/youtube-downloader/backend',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      out_file: 'E:/youtube-downloader/logs/backend.out.log',
      error_file: 'E:/youtube-downloader/logs/backend.err.log',
    },
    {
      name: 'ytarchiver-frontend',
      cwd: 'E:/youtube-downloader/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      out_file: 'E:/youtube-downloader/logs/frontend.out.log',
      error_file: 'E:/youtube-downloader/logs/frontend.err.log',
    },
  ],
};
```

```bat
mkdir E:\youtube-downloader\logs
cd E:\youtube-downloader
pm2 start ecosystem.config.js
pm2 save
```

Useful commands:

```bat
pm2 list
pm2 logs ytarchiver-backend
pm2 restart ytarchiver-backend
pm2 stop all
```

### 8.5 Put it behind a reverse proxy (recommended)

Run IIS (with URL Rewrite + Application Request Routing) or nginx-for-Windows in front of both processes to terminate TLS and route:

- `/` and static assets → `http://127.0.0.1:3000` (frontend)
- `/channels`, `/upload-configs`, `/recording-jobs`, `/auth/*`, `/ws` → `http://127.0.0.1:4000` (backend; make sure the proxy is configured to upgrade `/ws` to a WebSocket connection)

Then set `GOOGLE_REDIRECT_URI`, `CORS_ORIGIN`, and `NEXT_PUBLIC_*` to that public HTTPS domain as noted in §8.2.

---

## 9. Operational notes

- **Disk space**: recordings accumulate in `RECORDINGS_DIR` until uploaded; the pipeline does not currently delete local files after a successful upload — add a cleanup step in `recording-orchestrator.service.ts` (`handleRecordingExit`, after `COMPLETED`) if you want them removed automatically.
- **API quota**: `search.list` costs 100 quota units per call against YouTube's default 10,000/day project quota. With N monitored channels and a 60s poll interval, daily usage is roughly `N × 1440 × 100`. Increase `POLL_INTERVAL_MS` or request a quota increase if you monitor many channels.
- **OAuth token refresh**: Google refresh tokens can be invalidated (revoked access, password change, 6 months of inactivity, or exceeding 100 refresh tokens per client/user pair). If uploads start failing with `invalid_grant`, re-run the "Authorize with Google" flow for that destination to mint a fresh `UploadConfig`.
- **Windows process kill semantics**: Windows has no POSIX signals, so a forced stop (pausing/removing a channel mid-recording) hard-terminates `yt-dlp.exe` rather than triggering a graceful shutdown. `--hls-use-mpegts` is used specifically so the partial file is still a valid, playable/uploadable container in that case.
