-- AlterTable
-- Optional user-chosen label for a saved lineup ("Week 3 flyers"); null
-- means the profile card falls back to the save date.
ALTER TABLE "SavedLineup" ADD COLUMN "name" TEXT;
