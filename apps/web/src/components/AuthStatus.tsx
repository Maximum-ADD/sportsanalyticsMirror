import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { signInWithGoogle, useSession } from "@/lib/authClient";
import { useMe } from "@/lib/useMe";
import { pingHealth } from "@/lib/apiClient";

// Friendly copy for the BetterAuth error codes we're likely to actually see.
// Falls back to a generic message for anything else so an unrecognised code
// still shows something actionable instead of the raw slug.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: "That sign-in link expired before it finished. Please try again.",
  access_denied: "Sign-in was cancelled.",
  please_restart_the_process: "That sign-in link expired before it finished. Please try again.",
};

// Reads the ?error= BetterAuth appends to authErrorURL (see
// apps/api/src/auth/auth.config.ts) after a failed /auth/* redirect, e.g.
// a Google sign-in that didn't complete in time. Read once on mount, then
// stripped from the URL so refreshing or sharing the link doesn't re-show
// it. Not wired through react-router's useSearchParams so this component
// (mounted in the shared header on every page) doesn't need a Router in tests.
function useAuthErrorFromUrl(): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (!code) return;

    setMessage(AUTH_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.");

    params.delete("error");
    params.delete("error_description");
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, []);

  return message;
}

interface AuthStatusProps {
  signInCallbackURL?: string;
}

export function AuthStatus({ signInCallbackURL }: AuthStatusProps) {
  const { data: session, isPending } = useSession();
  const authError = useAuthErrorFromUrl();
  // Only fired once there's a session — GET /v1/me needs the session cookie
  // this same hook otherwise waits on (see useMe).
  const { data: me } = useMe();

  // BetterAuth's OAuth state row expires 10 minutes after sign-in starts —
  // hardcoded in the library, not configurable (checked up to the latest
  // better-auth release). A normal Google sign-in takes seconds, so hitting
  // that ceiling regularly points at Render's free-tier cold start eating
  // into the window: the API can idle-spin-down between the 10-minute
  // pinger hits, then has to wake back up mid-flow when Google redirects
  // back. This component mounts in the header on every page, so pinging
  // /health here gives the API a head start waking up before the visitor
  // has even found the sign-in button — it can only help, never block
  // rendering, and a failure here is silently ignored since it's just a
  // warm-up, not a real request. Skipped in tests: this file is rendered
  // by nearly every page's test suite, and none of them mock this call.
  useEffect(() => {
    if (import.meta.env.MODE !== "test") {
      pingHealth();
    }
  }, []);

  if (isPending) {
    return <div data-slot="skeleton" className="h-9 w-32 animate-pulse border border-white/20" />;
  }

  if (!session) {
    return (
      <div className="flex items-center gap-3">
        {authError && (
          <span role="alert" className="text-[11px] text-locker-bad">
            {authError}
          </span>
        )}
        <button
          type="button"
          onClick={() => signInWithGoogle(signInCallbackURL)}
          className="border border-white/20 px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap text-white uppercase transition-colors hover:border-brand-accent hover:text-brand-accent"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  // A brand-new user hasn't onboarded yet (no username/avatar from GET
  // /v1/me), so this falls back to the session's own name — still a real
  // identity to show, not a placeholder, for the brief window before
  // onboarding sets a username.
  const displayName = me?.username ?? session.user.name;
  const initial = displayName?.[0]?.toUpperCase() ?? "?";

  return (
    <Link
      to="/profile"
      className="group flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent"
    >
      {me?.avatarUrl ? (
        <img
          src={me.avatarUrl}
          alt=""
          aria-hidden
          className="size-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-locker-leather text-[11px] font-semibold text-white">
          {initial}
        </span>
      )}
      {/* group-hover (not a plain hover on this span) so the name reacts
          when anywhere on the row — avatar included — is hovered, and the
          orange matches the nav tabs' hover so "this is a link" reads
          identically across the whole bar. */}
      <span className="max-w-32 truncate text-[11px] font-medium tracking-[0.1em] text-white uppercase transition-colors group-hover:text-brand-accent">
        {displayName}
      </span>
    </Link>
  );
}
