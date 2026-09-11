// The browser origins this API trusts, shared by every layer that needs the
// list: BetterAuth (trustedOrigins), the Express CORS middleware in main.ts,
// and OriginCheckGuard.
//
// It lives here rather than in auth/auth.config.ts — where it started —
// because importing that module pulls in BetterAuth and a second PrismaClient
// at import time, and every e2e spec replaces it wholesale with
// vi.mock("../src/auth/auth.config.js", ...). A guard reading the list from
// there would see `undefined` under test. auth.config.ts re-exports this
// constant, so existing importers are unaffected.
//
// WEB_ORIGIN can be a single URL or a comma-separated list
// (e.g. "https://app.pages.dev,http://localhost:5173").
export const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());
