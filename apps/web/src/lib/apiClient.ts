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

/**
 * Reads the API's error envelope, so a failed write can say what went wrong.
 *
 * @param response - the failed response.
 * @param path - the request path, used when the body carries no message.
 * @returns the server's own message, or a generic one when the body is not
 *          the expected `{ error: { code, message } }` shape.
 *
 * A 409 on a pick means "you already called this game" and a 404 means "there
 * is nothing left to call" — messages worth showing. Falling back to the
 * status line alone would throw that away.
 */
async function readErrorMessage(response: Response, path: string): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // A non-JSON body (a proxy's HTML 502 page, say) is not worth reporting
    // verbatim to the user; fall through to the generic message.
  }
  return `Request to ${path} failed with status ${response.status}`;
}

/**
 * Sends a JSON body and returns the parsed response.
 *
 * @param path - API path, e.g. "/v1/me/picks".
 * @param body - serialised as the JSON request body.
 * @returns the parsed response body.
 * @throws ApiError carrying the server's status and message.
 *
 * `credentials: "include"` is required for the BetterAuth session cookie, and
 * the explicit Content-Type matters twice over: the API parses JSON bodies,
 * and OriginCheckGuard needs the browser to treat this as a request that
 * carries an Origin header rather than a simple form post.
 */
export function postJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>("POST", path, body);
}

/**
 * Sends a partial update.
 *
 * @param path - API path, e.g. "/v1/me/follows/players/<id>".
 * @param body - the fields to change, serialised as the JSON request body.
 * @returns the parsed response body.
 * @throws ApiError carrying the server's status and message.
 */
export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>("PATCH", path, body);
}

/**
 * Deletes a resource.
 *
 * @param path - API path, e.g. "/v1/me/follows/players/<id>".
 * @returns the parsed response body. These routes answer 200 with a small
 *          result object rather than a bare 204, so there is always one.
 * @throws ApiError carrying the server's status and message.
 */
export function deleteJson<T>(path: string): Promise<T> {
  return sendJson<T>("DELETE", path);
}

/**
 * The one write path: a method, a session cookie, and the server's own error
 * message when it fails.
 *
 * @param method - the HTTP verb.
 * @param path - API path.
 * @param body - the JSON request body, omitted entirely for bodyless verbs.
 * @returns the parsed response body.
 * @throws ApiError carrying the server's status and message.
 *
 * A DELETE sends no body and therefore no Content-Type. That is deliberate
 * rather than an oversight: the API's OriginCheckGuard vets the Origin header
 * on every non-GET, which browsers attach to all of these regardless, so the
 * header is not what carries the CSRF defence — and a Content-Type on a
 * bodyless request would only describe a body that isn't there.
 */
async function sendJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    ...(hasBody
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response, path), response.status);
  }
  return response.json() as Promise<T>;
}
