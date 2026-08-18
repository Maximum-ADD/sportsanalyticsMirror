import { createAuthClient } from "better-auth/react";

// Talks directly to the API origin rather than through the /api dev proxy —
// the OAuth redirect (browser -> Google -> back) has to land on a real,
// stable origin anyway, so the sign-in call goes there directly too. Must
// match the server's basePath in apps/api/src/auth/auth.config.ts.
export const authClient = createAuthClient({
  baseURL: "http://localhost:4000",
  basePath: "/auth",
});

export const { useSession } = authClient;
