CREATE TABLE "CustomStatistic" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "expression" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "authorId" TEXT NOT NULL, CONSTRAINT "CustomStatistic_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CustomStatistic_authorId_name_key" ON "CustomStatistic"("authorId", "name");
ALTER TABLE "CustomStatistic" ADD CONSTRAINT "CustomStatistic_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
