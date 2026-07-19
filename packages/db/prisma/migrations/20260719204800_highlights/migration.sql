-- CreateEnum
CREATE TYPE "HighlightStatus" AS ENUM ('QUEUED', 'DETECTING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "HighlightSet" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "status" "HighlightStatus" NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT,
    "localModel" TEXT,
    "promptHash" TEXT,
    "contentHash" TEXT,
    "items" JSONB,
    "costUsd" DECIMAL(10,6),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HighlightSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HighlightSet_videoId_key" ON "HighlightSet"("videoId");

-- AddForeignKey
ALTER TABLE "HighlightSet" ADD CONSTRAINT "HighlightSet_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
