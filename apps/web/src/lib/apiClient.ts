// In dev this is "/api" and the Vite dev proxy (vite.config.ts) forwards
// /api/* to the API on :4000. In production there is
// no proxy, so set VITE_API_BASE_URL to the API's public origin (e.g.
// https://api.example.com) at build time; the SPA then calls it directly,
// cross-origin, with CORS + Secure/SameSite=None session cookies. An empty
// string falls back too, so a copied .env doesn't break dev.
import { API_BASE_URL } from "./apiBase";

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

// Reads this app's { error: { code, message } } envelope (see ApiException
// on the API) when present, falling back to a generic message for anything
// that isn't — a network failure or an unrelated 5xx won't have that shape.
async function errorMessageFrom(response: Response, fallbackPath: string): Promise<string> {
  try {
    const body = await response.json();
    if (body?.error?.message) return body.error.message as string;
  } catch {
    // Response body wasn't JSON (or was empty) — fall through to the generic message.
  }
  return `Request to ${fallbackPath} failed with status ${response.status}`;
}

// PATCH/PUT/DELETE with a JSON body — mutations that aren't a file upload
// (see postFormData below for that case). Shares ApiError/credentials
// behaviour with fetchJson so callers can handle both the same way.
export async function sendJson<T>(path: string, method: "PATCH" | "PUT" | "DELETE" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new ApiError(await errorMessageFrom(response, path), response.status);
  }
  return response.json() as Promise<T>;
}

// Multipart upload — deliberately does NOT set a Content-Type header itself
// so the browser can set multipart/form-data with the correct boundary,
// which it only does when the header is left unset.
export async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    throw new ApiError(await errorMessageFrom(response, path), response.status);
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
