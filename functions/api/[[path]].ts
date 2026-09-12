import { proxyToApi } from "../_shared/proxy";

interface Env {
  // Optional override; falls back to the production Render origin baked
  // into proxy.ts, matching apps/web/src/lib/apiBase.ts's own default so
  // neither side needs a Cloudflare Pages dashboard env var to work.
  API_ORIGIN?: string;
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const path = new URL(context.request.url).pathname.replace(/^\/api/, "");
  return proxyToApi(context.request, context.env.API_ORIGIN, path);
}
