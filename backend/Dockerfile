FROM node:20-bookworm-slim

# chromium (full, not --no-install-recommends) pulls in the shared libs it
# needs to actually launch headless -- trimming recommends here is what
# breaks headless launch with missing .so errors.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl unzip \
    && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && curl -L https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o /tmp/deno.zip \
    && unzip -o /tmp/deno.zip -d /usr/local/bin \
    && rm /tmp/deno.zip \
    && chmod a+rx /usr/local/bin/deno

# yt-dlp plugin that fetches PO tokens from the bgutil-provider service (see
# docker-compose.prod.yml). Keep this version in step with that image's tag --
# the plugin and the server are released together.
ARG BGUTIL_VERSION=2.0.2
RUN mkdir -p /etc/yt-dlp/plugins \
    && curl -L https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSION}/bgutil-ytdlp-pot-provider.zip \
       -o /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip \
    && chmod a+r /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip

ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=ffmpeg
ENV RECORDINGS_DIR=/app/storage/recordings

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
