-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('QUEUED', 'TRANSCRIBING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Transcript" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "status" "TranscriptStatus" NOT NULL DEFAULT 'QUEUED',
    "language" TEXT,
    "model" TEXT,
    "text" TEXT,
    "words" JSONB,
    "contentHash" TEXT,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_videoId_key" ON "Transcript"("videoId");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
