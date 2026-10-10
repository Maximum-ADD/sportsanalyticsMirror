-- CreateEnum
CREATE TYPE "PickOutcome" AS ENUM ('CORRECT', 'MISSED');

-- CreateTable
CREATE TABLE "FollowedPlayer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowedPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowedTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowedTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "pickedTeamId" TEXT NOT NULL,
    "outcome" "PickOutcome" NOT NULL,
    "modelHomeWinProbabilityAtPick" DOUBLE PRECISION NOT NULL,
    "modelPredictedMarginAtPick" DOUBLE PRECISION,
    "homeTeamEloAtPick" DOUBLE PRECISION NOT NULL,
    "awayTeamEloAtPick" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedComparison" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedComparisonPlayer" (
    "id" TEXT NOT NULL,
    "savedComparisonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SavedComparisonPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedLineup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceLineupId" TEXT,
    "totalPredictedPointsAtSave" DOUBLE PRECISION NOT NULL,
    "totalSalaryAtSave" INTEGER NOT NULL,
    "budgetAtSave" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedLineupSlot" (
    "id" TEXT NOT NULL,
    "savedLineupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "predictedPointsAtSave" DOUBLE PRECISION NOT NULL,
    "salaryAtSave" INTEGER NOT NULL,

    CONSTRAINT "SavedLineupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowedPlayer_userId_createdAt_idx" ON "FollowedPlayer"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowedPlayer_userId_playerId_key" ON "FollowedPlayer"("userId", "playerId");

-- CreateIndex
CREATE INDEX "FollowedTeam_userId_createdAt_idx" ON "FollowedTeam"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowedTeam_userId_teamId_key" ON "FollowedTeam"("userId", "teamId");

-- CreateIndex
CREATE INDEX "GamePick_userId_createdAt_idx" ON "GamePick"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GamePick_userId_gameId_key" ON "GamePick"("userId", "gameId");

-- CreateIndex
CREATE INDEX "SavedComparison_userId_createdAt_idx" ON "SavedComparison"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedComparisonPlayer_savedComparisonId_playerId_key" ON "SavedComparisonPlayer"("savedComparisonId", "playerId");

-- CreateIndex
CREATE INDEX "SavedLineup_userId_createdAt_idx" ON "SavedLineup"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedLineupSlot_savedLineupId_playerId_key" ON "SavedLineupSlot"("savedLineupId", "playerId");

-- AddForeignKey
ALTER TABLE "FollowedPlayer" ADD CONSTRAINT "FollowedPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowedPlayer" ADD CONSTRAINT "FollowedPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowedTeam" ADD CONSTRAINT "FollowedTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowedTeam" ADD CONSTRAINT "FollowedTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePick" ADD CONSTRAINT "GamePick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePick" ADD CONSTRAINT "GamePick_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedComparison" ADD CONSTRAINT "SavedComparison_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedComparisonPlayer" ADD CONSTRAINT "SavedComparisonPlayer_savedComparisonId_fkey" FOREIGN KEY ("savedComparisonId") REFERENCES "SavedComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedComparisonPlayer" ADD CONSTRAINT "SavedComparisonPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLineup" ADD CONSTRAINT "SavedLineup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLineupSlot" ADD CONSTRAINT "SavedLineupSlot_savedLineupId_fkey" FOREIGN KEY ("savedLineupId") REFERENCES "SavedLineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLineupSlot" ADD CONSTRAINT "SavedLineupSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
