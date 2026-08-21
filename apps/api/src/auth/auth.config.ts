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
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  basePath: "/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  trustedOrigins: allowedOrigins,
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
  },
});
