-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('OFFLINE', 'LIVE');
CREATE TYPE "RecordingStatus" AS ENUM ('IDLE', 'RECORDING', 'PAUSED', 'ERROR');

-- AlterTable: MonitoredChannel.status (old ChannelStatus: IDLE/LIVE/ERROR)
-- conflated "is YouTube live" with "is this app recording", which is exactly
-- what this migration splits apart. Backfill both new columns from the old
-- one + isActive before dropping it, so no existing channel's state is lost.
ALTER TABLE "MonitoredChannel" ADD COLUMN "liveStatus" "LiveStatus";
ALTER TABLE "MonitoredChannel" ADD COLUMN "recordingStatus" "RecordingStatus";

UPDATE "MonitoredChannel" SET
  "liveStatus" = CASE WHEN "status" = 'LIVE' THEN 'LIVE'::"LiveStatus" ELSE 'OFFLINE'::"LiveStatus" END,
  "recordingStatus" = CASE
    WHEN "status" = 'ERROR' THEN 'ERROR'::"RecordingStatus"
    WHEN NOT "isActive" THEN 'PAUSED'::"RecordingStatus"
    WHEN "status" = 'LIVE' THEN 'RECORDING'::"RecordingStatus"
    ELSE 'IDLE'::"RecordingStatus"
  END;

ALTER TABLE "MonitoredChannel" ALTER COLUMN "liveStatus" SET NOT NULL;
ALTER TABLE "MonitoredChannel" ALTER COLUMN "liveStatus" SET DEFAULT 'OFFLINE';
ALTER TABLE "MonitoredChannel" ALTER COLUMN "recordingStatus" SET NOT NULL;
ALTER TABLE "MonitoredChannel" ALTER COLUMN "recordingStatus" SET DEFAULT 'IDLE';

ALTER TABLE "MonitoredChannel" DROP COLUMN "status";

-- DropEnum (no longer referenced by any column)
DROP TYPE "ChannelStatus";
