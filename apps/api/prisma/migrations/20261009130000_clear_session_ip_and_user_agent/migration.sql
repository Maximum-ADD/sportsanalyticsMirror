-- Sessions no longer record the visitor's IP address or user agent (see
-- databaseHooks.session in src/auth/auth.config.ts): nothing in the app
-- reads either, so keeping them breaks POPIA's minimality condition (s10).
-- This clears what earlier sessions recorded. The columns stay, because
-- BetterAuth's schema expects them.
UPDATE "Session" SET "ipAddress" = NULL, "userAgent" = NULL
WHERE "ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL;
