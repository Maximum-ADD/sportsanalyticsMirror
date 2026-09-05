import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// A dedicated Prisma client for BetterAuth's own use. This module is a
// plain singleton instantiated at import time (by main.ts and by
// SessionAuthGuard), outside Nest's DI lifecycle, so it can't share the
// Nest-managed PrismaService — a second connection to the same database is
// the standard, documented way to wire BetterAuth's Prisma adapter.
const prisma = new PrismaClient();

// WEB_ORIGIN can be a single URL or a comma-separated list
// (e.g. "https://app.pages.dev,http://localhost:5173").
// Both BetterAuth (trustedOrigins) and the Express CORS middleware in
// main.ts read from this shared array so the two layers stay in sync.
export const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

// Mounted at /auth (not the BetterAuth default /api/auth) to match this
// project's existing routing convention — see main.ts for where the raw
// handler is attached, and vite.config.ts's dev proxy strips a leading
// /api before forwarding to this server.
// Where BetterAuth sends the browser on a failed /auth/* flow (bad OAuth
// state, denied consent, etc.) when no per-call errorCallbackURL is given.
// Without this, BetterAuth's own default is `${baseURL}/error` — a page on
// the *API's* own origin, which this Nest app doesn't serve, so failures
// surfaced as a raw 404 instead of anything the user could act on. This app
// has no dedicated /login route (sign-in is inline via AuthStatus in the
// Navbar, present on every page), so we send the browser back to the
// frontend's root; BetterAuth appends its own `?error=<code>` to whatever
// URL we give it here, which AuthStatus reads to show a real message.
const authErrorURL = allowedOrigins[0];

// Locally, the web app (localhost:5173) and the API (localhost:4000) share
// the registrable domain "localhost", so every BetterAuth cookie is set and
// read in a same-site context and the library's SameSite=Lax default works
// unmodified. In production the web app (Cloudflare Pages) and the API
// (Render) are on two unrelated domains, and the very first cookie of the
// OAuth flow — the "state" cookie paired with the Postgres verification row
// (see the maxAge fix below) — is set as the response to a cross-origin
// fetch from authClient.signIn.social(), not a top-level navigation. A
// SameSite=Lax cookie set that way is exactly the case browsers (Safari ITP
// in particular, increasingly Chrome) refuse to persist, so the browser
// never has the state cookie to send back on Google's callback redirect —
// a second, distinct cause of the same `state_mismatch` error as the
// maxAge issue, present only in prod because only prod is genuinely
// cross-site. SameSite=None (paired with Secure, which BetterAuth already
// sets automatically once baseURL is https) is the standard fix; gating it
// behind NODE_ENV keeps local dev untouched, since SameSite=None without
// Secure is silently dropped by browsers and baseURL is http in dev.
const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  basePath: "/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  trustedOrigins: allowedOrigins,
  onAPIError: {
    errorURL: authErrorURL,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  user: {
    additionalFields: {
      // RBAC role for this app (see RolesGuard). input: false means neither
      // a sign-up payload nor a Google profile can set/overwrite it — it
      // only ever changes via a direct database update.
      role: {
        type: "string",
        defaultValue: "USER",
        input: false,
      },
    },
    // Turns on BetterAuth's built-in POST /auth/delete-user endpoint (see
    // AuthStatus.tsx's DeleteAccountControl, which calls it via
    // authClient.deleteUser() — no separate Nest controller needed). No
    // password confirmation flow is offered since every account here is
    // Google-only; BetterAuth instead requires the session to be "fresh"
    // (see session.freshAge below) as its confirmation step.
    deleteUser: {
      enabled: true,
    },
  },
  session: {
    // How recently the user must have signed in for /auth/delete-user to
    // succeed without extra verification. Default is 24h; a Google-only
    // app has no password to re-prompt for, so this is the only guard
    // against e.g. a stolen long-lived session cookie deleting the account.
    // Kept short and explicit rather than relying on the library default.
    freshAge: 60 * 10, // 10 minutes
  },
  advanced: {
    cookies: {
      // The short-lived CSRF cookie BetterAuth pairs with the OAuth state
      // row it writes to Postgres (see docs/bug-auth-state-mismatch.md for
      // the full investigation). The library's own default here is 5
      // minutes, but the Postgres-side verification row it's checked
      // against is valid for 10 — so a Google sign-in that takes anywhere
      // from 5-10 minutes (first consent screen, 2FA, picking an account)
      // fails with `state_mismatch` even though nothing is actually wrong.
      // Widening this to match the 10-minute DB row closes that gap.
      state: {
        attributes: { maxAge: 60 * 10 },
      },
    },
    // See the isProduction comment above: only the deployed environment is
    // genuinely cross-site, so only there do cookies need SameSite=None to
    // survive the fetch-initiated sign-in call. `secure` is left alone
    // rather than forced here — BetterAuth already derives it from
    // baseURL's protocol (https in prod, http in dev), and SameSite=None
    // without Secure is dropped by browsers outright, so hardcoding
    // `secure: true` would silently break dev if this block ever ran with
    // NODE_ENV=production against a non-https baseURL.
    //
    // Deliberately NOT using the `partitioned` (CHIPS) attribute some
    // browsers now expect on third-party SameSite=None cookies: CHIPS
    // partitions a cookie by the top-level site at the moment it's set —
    // here that's pages.dev, since the state cookie is set from a fetch()
    // called by a page on pages.dev. By the time it needs to be read back,
    // on Google's redirect straight to the Render API domain, there's no
    // pages.dev top-level context at all — it's a direct top-level
    // navigation onto the API's own origin. A partitioned cookie's
    // partition key wouldn't match at read time, so it would never be sent
    // back, reintroducing the exact failure this fixes. CHIPS suits a
    // fixed third party embedded under the same top-level site every time
    // (e.g. a widget iframe), not a flow where the top-level site itself
    // changes across the redirect chain.
    ...(isProduction ? { defaultCookieAttributes: { sameSite: "none" as const } } : {}),
  },
});
