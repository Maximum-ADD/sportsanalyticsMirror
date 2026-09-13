// Same-origin relative path in both dev and production. Dev: Vite's proxy
// (vite.config.ts) forwards /api -> localhost:4000. Production: Cloudflare
// Pages Functions (functions/api/[[path]].ts) proxy /api -> the Render API,
// so the browser only ever talks to this app's own origin -- see
// docs/decisions/ADR-003-hosting-topology.md. That matters for auth: Safari
// and Firefox block/partition cookies by top-level site, so a session
// cookie set by a genuinely cross-origin API is unreadable afterwards no
// matter how its attributes are tuned. Proxying through one origin makes
// every cookie first-party instead.
//
// VITE_API_BASE_URL, if set, overrides this to call a specific backend
// directly and bypass the proxy -- not needed for normal dev or production
// use. authClient.ts reuses the same override for the same reason.
const override = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = override || "/api";
export const API_ORIGIN_OVERRIDE = override || undefined;
