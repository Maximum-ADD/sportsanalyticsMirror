-- CreateEnum
CREATE TYPE "AllTimeLeaderCategory" AS ENUM ('GAMES_PLAYED', 'POINTS', 'ASSISTS', 'STEALS', 'OFFENSIVE_REBOUNDS', 'DEFENSIVE_REBOUNDS', 'REBOUNDS', 'BLOCKS', 'FIELD_GOALS_MADE', 'THREES_MADE', 'FREE_THROWS_MADE');

-- CreateTable
CREATE TABLE "AllTimeLeaderPlayer" (
    "nbaPlayerId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT,
    "heightInches" INTEGER,
    "weightLbs" INTEGER,
    "birthDate" TIMESTAMP(3),
    "school" TEXT,
    "country" TEXT,
    "fromYear" INTEGER,
    "toYear" INTEGER,
    "seasonExp" INTEGER,
    "draftYear" INTEGER,
    "draftRound" INTEGER,
    "draftNumber" INTEGER,
    "isGreatest75" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL,
    "bioFetchedAt" TIMESTAMP(3),

    CONSTRAINT "AllTimeLeaderPlayer_pkey" PRIMARY KEY ("nbaPlayerId")
);

-- CreateTable
CREATE TABLE "AllTimeLeader" (
    "id" TEXT NOT NULL,
    "category" "AllTimeLeaderCategory" NOT NULL,
    "seasonType" "SeasonType" NOT NULL,
    "rank" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "nbaPlayerId" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllTimeLeader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllTimeLeader_category_seasonType_rank_idx" ON "AllTimeLeader"("category", "seasonType", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "AllTimeLeader_category_seasonType_nbaPlayerId_key" ON "AllTimeLeader"("category", "seasonType", "nbaPlayerId");

-- AddForeignKey
ALTER TABLE "AllTimeLeader" ADD CONSTRAINT "AllTimeLeader_nbaPlayerId_fkey" FOREIGN KEY ("nbaPlayerId") REFERENCES "AllTimeLeaderPlayer"("nbaPlayerId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security on, matching every other table since
-- 20261009120000_lock_down_supabase_data_api. The API and the ingestion
-- connect as the tables' owner, which RLS doesn't restrict.
ALTER TABLE "AllTimeLeaderPlayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AllTimeLeader" ENABLE ROW LEVEL SECURITY;
