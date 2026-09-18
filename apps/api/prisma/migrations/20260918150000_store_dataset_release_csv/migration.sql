-- Store each release's CSV at publish time, so downloads serve the exact
-- snapshot that was released instead of rebuilding it from live data.
-- Nullable: releases published before this keep being rebuilt on download.
ALTER TABLE "DatasetRelease" ADD COLUMN "csv" TEXT;
