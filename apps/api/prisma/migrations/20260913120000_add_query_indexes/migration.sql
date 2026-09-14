-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Game_gameDate_idx" ON "Game"("gameDate");

-- CreateIndex
CREATE INDEX "Game_homeTeamId_gameDate_idx" ON "Game"("homeTeamId", "gameDate");

-- CreateIndex
CREATE INDEX "Game_awayTeamId_gameDate_idx" ON "Game"("awayTeamId", "gameDate");

-- CreateIndex
CREATE INDEX "PlayerGameStat_gameId_idx" ON "PlayerGameStat"("gameId");
