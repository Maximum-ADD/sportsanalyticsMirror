import { authClient, useSession } from "../lib/authClient";

export function AuthStatus() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="px-2 text-sm text-text-muted">Loading…</div>;
  }

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: window.location.href })}
        className="w-full rounded-md bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-soft"
      >
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <span className="truncate text-sm text-text-secondary" title={session.user.email}>
        {session.user.email}
      </span>
      <button
        type="button"
        onClick={() => authClient.signOut()}
        className="shrink-0 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        Sign out
      </button>
    </div>
  );
}
