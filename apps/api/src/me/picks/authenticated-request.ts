// The shape SessionAuthGuard leaves behind on the request once it has
// verified the session: request.user is the BetterAuth user. Only the id is
// declared, because that is all these routes use — every row this slice reads
// or writes is scoped by it, and narrowing the type here means a handler
// cannot casually reach for an email or a name it has no business echoing.
export interface AuthenticatedRequest {
  user: { id: string };
}
