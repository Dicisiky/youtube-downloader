-- AlterTable: optional destination playlist for a monitored channel's uploads
ALTER TABLE "MonitoredChannel" ADD COLUMN "playlistId" TEXT;
ALTER TABLE "MonitoredChannel" ADD COLUMN "playlistTitle" TEXT;
