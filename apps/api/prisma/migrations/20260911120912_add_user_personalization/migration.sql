-- Every pre-existing User row predates this feature and has never
-- onboarded, so username/avatarUrl/favoriteTeamId all default to NULL —
-- no backfill needed, same reasoning as the seasonType migration's DEFAULT
-- 'REGULAR' (that one just happened to have a real default value to
-- backfill with; this one's honest default is "hasn't chosen yet").
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "favoriteTeamId" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "UserFollowedPlayer" (
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFollowedPlayer_userId_playerId_key" ON "UserFollowedPlayer"("userId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favoriteTeamId_fkey" FOREIGN KEY ("favoriteTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollowedPlayer" ADD CONSTRAINT "UserFollowedPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollowedPlayer" ADD CONSTRAINT "UserFollowedPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
