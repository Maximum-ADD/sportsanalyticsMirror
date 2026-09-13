import { createAuthClient } from "better-auth/react";
import { API_ORIGIN_OVERRIDE } from "./apiBase";

// baseURL is left undefined by default, which makes better-auth's client
// fall back to window.location.origin (see getBaseURL in
// better-auth/dist/utils/url.mjs) -- i.e. same-origin, proxied like /api
// (see apiBase.ts and functions/auth/[[path]].ts for why: cross-origin
// session cookies don't survive Safari/Firefox's third-party cookie
// blocking, no matter how they're configured). Must match the server's
// basePath in apps/api/src/auth/auth.config.ts.
export const authClient = createAuthClient({
  baseURL: API_ORIGIN_OVERRIDE,
  basePath: "/auth",
});

export const { useSession } = authClient;

export function signInWithGoogle(callbackURL = window.location.href) {
  return authClient.signIn.social({ provider: "google", callbackURL });
}
