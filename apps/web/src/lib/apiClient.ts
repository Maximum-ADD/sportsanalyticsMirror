// In dev this is "/api" and the Vite dev proxy (vite.config.ts) forwards
// /api/* to the API on :4000. In production there is
// no proxy, so set VITE_API_BASE_URL to the API's public origin (e.g.
// https://api.example.com) at build time; the SPA then calls it directly,
// cross-origin, with CORS + Secure/SameSite=None session cookies. An empty
// string falls back too, so a copied .env doesn't break dev.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

// Fire-and-forget warm-up for Render's free-tier cold start — see the call
// site in AuthStatus.tsx. Deliberately swallows every failure: this is an
// optimisation, not a request anything depends on, so a network error here
// must never surface to the caller or the page.
export function pingHealth(): void {
  fetch(`${API_BASE_URL}/health`, { credentials: "include" }).catch(() => {});
}
