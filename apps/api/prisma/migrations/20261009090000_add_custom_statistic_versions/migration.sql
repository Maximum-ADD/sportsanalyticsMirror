-- CreateTable
CREATE TABLE "CustomStatisticVersion" (
    "id" TEXT NOT NULL,
    "statisticId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "expression" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomStatisticVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomStatisticVersion_statisticId_version_key" ON "CustomStatisticVersion"("statisticId", "version");

-- AddForeignKey
ALTER TABLE "CustomStatisticVersion" ADD CONSTRAINT "CustomStatisticVersion_statisticId_fkey" FOREIGN KEY ("statisticId") REFERENCES "CustomStatistic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing statistic's current expression becomes the row
-- for its current version. Expressions replaced before this table existed
-- were overwritten in place and can't be recovered, so a statistic already
-- at version 3 starts its history at 3.
INSERT INTO "CustomStatisticVersion" ("id", "statisticId", "version", "expression", "createdAt")
SELECT gen_random_uuid()::text, "id", "version", "expression", "updatedAt"
FROM "CustomStatistic";
