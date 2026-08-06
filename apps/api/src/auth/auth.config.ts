import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// A dedicated Prisma client for BetterAuth's own use. This module is a
// plain singleton instantiated at import time (by main.ts and by
// SessionAuthGuard), outside Nest's DI lifecycle, so it can't share the
// Nest-managed PrismaService — a second connection to the same database is
// the standard, documented way to wire BetterAuth's Prisma adapter.
const prisma = new PrismaClient();

// Mounted at /auth (not the BetterAuth default /api/auth) to match this
// project's existing routing convention — see main.ts for where the raw
// handler is attached, and vite.config.ts's dev proxy strips a leading
// /api before forwarding to this server.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  basePath: "/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:5173"],
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
