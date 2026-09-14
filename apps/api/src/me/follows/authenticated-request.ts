/**
 * What SessionAuthGuard leaves on the request once it has accepted a session:
 * `request.user`, the BetterAuth user. Every route in this module is behind
 * that guard, so the property is declared non-optional here - if the guard did
 * not run, the handler did not run either.
 *
 * Only `id` is declared because that is all these routes use: it scopes every
 * query to the caller's own rows.
 */
export interface AuthenticatedRequest {
  user: { id: string };
}
