-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('QUEUED', 'RENDERING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Clip" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "status" "ClipStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "sizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clip_videoId_index_idx" ON "Clip"("videoId", "index");

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
