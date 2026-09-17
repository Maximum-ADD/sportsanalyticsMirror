import { proxyToApi } from "../_shared/proxy";

interface Env {
  // Optional override; falls back to the production Render origin baked
  // into proxy.ts, matching apps/web/src/lib/apiBase.ts's own default so
  // neither side needs a Cloudflare Pages dashboard env var to work.
  API_ORIGIN?: string;
  // First-party API key attached to proxied /api requests that don't carry
  // their own X-API-Key, so signed-out browsers keep working now that the
  // API requires a key or session. Create the consumer/key on the
  // production database (consumer "NBA Analytics Web App (first-party)",
  // key label "site-proxy") and set this in the Pages dashboard before the
  // guarded API ships — otherwise every signed-out data call returns 401.
  SITE_PROXY_API_KEY?: string;
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const path = new URL(context.request.url).pathname.replace(/^\/api/, "");
  return proxyToApi(context.request, context.env.API_ORIGIN, path, context.env.SITE_PROXY_API_KEY);
}
