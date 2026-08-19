import { createAuthClient } from "better-auth/react";

// Talks directly to the API origin rather than through the /api dev proxy —
// the OAuth redirect (browser -> Google -> back) has to land on a real,
// stable origin anyway, so the sign-in call goes there directly too. Must
// match the server's basePath in apps/api/src/auth/auth.config.ts. In
// production, set VITE_API_BASE_URL to the API's public origin
// (e.g. https://api.example.com); defaults to localhost:4000 for dev.
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
  basePath: "/auth",
});

export const { useSession } = authClient;
