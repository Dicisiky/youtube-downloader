-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('IDLE', 'LIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('MONITORING', 'RECORDING', 'PROCESSING', 'UPLOADING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateTable
CREATE TABLE "MonitoredChannel" (
    "id" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT,
    "channelThumbnail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "ChannelStatus" NOT NULL DEFAULT 'IDLE',
    "currentVideoId" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "uploadConfigId" TEXT NOT NULL,
    "defaultVisibility" "Visibility" NOT NULL DEFAULT 'UNLISTED',
    "titleTemplate" TEXT NOT NULL DEFAULT '{channelTitle} - {originalTitle} ({date})',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadConfig" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "youtubeChannelTitle" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingJob" (
    "id" TEXT NOT NULL,
    "monitoredChannelId" TEXT NOT NULL,
    "sourceVideoId" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'MONITORING',
    "filePath" TEXT,
    "fileSizeBytes" BIGINT,
    "destinationVideoId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordingEndedAt" TIMESTAMP(3),
    "uploadStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredChannel_channelId_key" ON "MonitoredChannel"("channelId");

-- CreateIndex
CREATE INDEX "MonitoredChannel_isActive_idx" ON "MonitoredChannel"("isActive");

-- CreateIndex
CREATE INDEX "RecordingJob_monitoredChannelId_idx" ON "RecordingJob"("monitoredChannelId");

-- CreateIndex
CREATE INDEX "RecordingJob_status_idx" ON "RecordingJob"("status");

-- AddForeignKey
ALTER TABLE "MonitoredChannel" ADD CONSTRAINT "MonitoredChannel_uploadConfigId_fkey" FOREIGN KEY ("uploadConfigId") REFERENCES "UploadConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingJob" ADD CONSTRAINT "RecordingJob_monitoredChannelId_fkey" FOREIGN KEY ("monitoredChannelId") REFERENCES "MonitoredChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
