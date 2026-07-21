-- AlterEnum
ALTER TYPE "HighlightStatus" ADD VALUE 'IDLE';

-- AlterTable
ALTER TABLE "HighlightSet" ADD COLUMN     "config" JSONB;
