-- Page tutorials: which page walkthroughs a user has seen, and whether
-- tutorials may open by themselves at all (the tutorial's "Skip all").
-- autoOpenTutorials defaults to true, so every existing account is shown
-- each page's tutorial once, exactly like an account created after this —
-- no backfill needed. A missing UserSeenTutorial row is the honest default
-- for "has not seen it yet".
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoOpenTutorials" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserSeenTutorial" (
    "userId" TEXT NOT NULL,
    "tutorialId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSeenTutorial_userId_tutorialId_key" ON "UserSeenTutorial"("userId", "tutorialId");

-- AddForeignKey
ALTER TABLE "UserSeenTutorial" ADD CONSTRAINT "UserSeenTutorial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
