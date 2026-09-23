-- CreateTable
CREATE TABLE "Archetype" (
    "id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "clusterId" INTEGER NOT NULL,
    "referenceCentroid" JSONB NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'unversioned',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Archetype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerArchetype" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "featureVector" JSONB NOT NULL,
    "distanceToCentroid" DOUBLE PRECISION NOT NULL,
    "plotX" DOUBLE PRECISION NOT NULL,
    "plotY" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'unversioned',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerArchetype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerArchetypeMembership" (
    "id" TEXT NOT NULL,
    "playerArchetypeId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PlayerArchetypeMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSimilarity" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "similarPlayerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'unversioned',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerSimilarity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Archetype_season_idx" ON "Archetype"("season");

-- CreateIndex
CREATE UNIQUE INDEX "Archetype_season_clusterId_key" ON "Archetype"("season", "clusterId");

-- CreateIndex
CREATE INDEX "PlayerArchetype_season_idx" ON "PlayerArchetype"("season");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerArchetype_playerId_season_key" ON "PlayerArchetype"("playerId", "season");

-- CreateIndex
CREATE INDEX "PlayerArchetypeMembership_playerArchetypeId_rank_idx" ON "PlayerArchetypeMembership"("playerArchetypeId", "rank");

-- CreateIndex
CREATE INDEX "PlayerArchetypeMembership_archetypeId_idx" ON "PlayerArchetypeMembership"("archetypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerArchetypeMembership_playerArchetypeId_archetypeId_key" ON "PlayerArchetypeMembership"("playerArchetypeId", "archetypeId");

-- CreateIndex
CREATE INDEX "PlayerSimilarity_playerId_season_rank_idx" ON "PlayerSimilarity"("playerId", "season", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSimilarity_playerId_similarPlayerId_season_key" ON "PlayerSimilarity"("playerId", "similarPlayerId", "season");

-- AddForeignKey
ALTER TABLE "PlayerArchetype" ADD CONSTRAINT "PlayerArchetype_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerArchetypeMembership" ADD CONSTRAINT "PlayerArchetypeMembership_playerArchetypeId_fkey" FOREIGN KEY ("playerArchetypeId") REFERENCES "PlayerArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerArchetypeMembership" ADD CONSTRAINT "PlayerArchetypeMembership_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "Archetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSimilarity" ADD CONSTRAINT "PlayerSimilarity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSimilarity" ADD CONSTRAINT "PlayerSimilarity_similarPlayerId_fkey" FOREIGN KEY ("similarPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

