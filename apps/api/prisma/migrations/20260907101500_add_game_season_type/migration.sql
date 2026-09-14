-- CreateEnum
CREATE TYPE "SeasonType" AS ENUM ('REGULAR', 'PLAY_IN', 'PLAYOFFS', 'FINALS');

-- AlterTable
-- Every pre-existing Game row was ingested with LeagueGameFinder's
-- season_type_nullable="Regular Season", so DEFAULT 'REGULAR' backfills
-- them correctly and no data cleanup pass is needed.
ALTER TABLE "Game" ADD COLUMN     "playoffRound" INTEGER,
ADD COLUMN     "seasonType" "SeasonType" NOT NULL DEFAULT 'REGULAR';

-- CreateIndex
CREATE INDEX "Game_seasonType_idx" ON "Game"("seasonType");
