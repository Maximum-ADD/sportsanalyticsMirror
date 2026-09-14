// Shared by functions/api/[[path]].ts and functions/auth/[[path]].ts. Both
// exist so the browser only ever talks to this app's own origin instead of
// calling the Render API cross-site -- see apps/web/src/lib/apiBase.ts and
// docs/decisions/ADR-003-hosting-topology.md for why that matters: Safari
// and Firefox partition/block cookies by top-level site, so a session
// cookie set by a genuinely cross-origin API is unreadable on later
// requests no matter how its attributes (SameSite, Secure, maxAge) are
// tuned. Proxying every request through one origin makes the cookie
// first-party instead, sidestepping that restriction entirely.
//
// redirect: "manual" is required for the /auth/callback/* hop: BetterAuth
// responds to it with a 302 (plus the session Set-Cookie), and that
// response must reach the browser as-is so the browser performs the
// redirect itself -- if fetch() followed it automatically, the redirect
// (and the Set-Cookie that matters) would be consumed here instead.
const DEFAULT_API_ORIGIN = "https://sportsanalytics-api.onrender.com";

export async function proxyToApi(request: Request, apiOrigin: string | undefined, rewrittenPath: string): Promise<Response> {
  const origin = apiOrigin?.trim() || DEFAULT_API_ORIGIN;
  const incomingUrl = new URL(request.url);
  const target = new URL(`${rewrittenPath}${incomingUrl.search}`, origin);

  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}
