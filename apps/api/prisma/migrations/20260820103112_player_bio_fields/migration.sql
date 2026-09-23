-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "country" TEXT,
ADD COLUMN     "draftNumber" INTEGER,
ADD COLUMN     "draftRound" INTEGER,
ADD COLUMN     "draftYear" INTEGER,
ADD COLUMN     "lastAffiliation" TEXT,
ADD COLUMN     "rosterStatus" TEXT,
ADD COLUMN     "school" TEXT,
ADD COLUMN     "seasonExp" INTEGER;
