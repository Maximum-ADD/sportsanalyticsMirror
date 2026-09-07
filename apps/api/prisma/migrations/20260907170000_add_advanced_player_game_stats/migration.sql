-- AlterTable
-- All nullable on purpose: rows written before these columns existed have no
-- value for them, and that absence is meaningful. Defaulting to 0 would claim
-- an even plus/minus and a 0% usage rate for every historical game, which are
-- real measurements rather than missing ones. The API renders null as "—".
ALTER TABLE "PlayerGameStat" ADD COLUMN     "defensiveRating" DOUBLE PRECISION,
ADD COLUMN     "defensiveRebounds" INTEGER,
ADD COLUMN     "offensiveRating" DOUBLE PRECISION,
ADD COLUMN     "offensiveRebounds" INTEGER,
ADD COLUMN     "plusMinus" INTEGER,
ADD COLUMN     "usagePercentage" DOUBLE PRECISION;
