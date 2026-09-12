import { createAuthClient } from "better-auth/react";
import { API_ORIGIN } from "./apiBase";

// Talks directly to the API origin rather than through the /api dev proxy —
// the OAuth redirect (browser -> Google -> back) has to land on a real,
// stable origin anyway, so the sign-in call goes there directly too. Must
// match the server's basePath in apps/api/src/auth/auth.config.ts. In
// production, VITE_API_BASE_URL can override the deployed Render API origin.
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: "/auth",
});

export const { useSession } = authClient;

export function signInWithGoogle(callbackURL = window.location.href) {
  return authClient.signIn.social({ provider: "google", callbackURL });
}
