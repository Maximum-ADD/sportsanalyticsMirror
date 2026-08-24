import { useEffect, useState } from "react";
import { authClient, signInWithGoogle, useSession } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
// (mounted in the Navbar on every page) doesn't need a Router in tests.
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

export function AuthStatus() {
  const { data: session, isPending } = useSession();
  const authError = useAuthErrorFromUrl();

  if (isPending) {
    return <Skeleton className="h-9 w-28" />;
  }

  if (!session) {
    return (
      <div className="flex items-center gap-3">
        {authError && (
          <span role="alert" className="text-sm text-red-400">
            {authError}
          </span>
        )}
        <Button
          type="button"
          onClick={() => signInWithGoogle()}
        >
          Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="max-w-40 truncate text-sm text-text-secondary" title={session.user.email}>
        {session.user.email}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
      <DeleteAccountControl />
    </div>
  );
}

// Two-click confirm rather than a modal, since this app has no dialog
// component yet (see components/ui) and pulling one in just for this felt
// heavier than the feature warrants. Clicking "Delete account" arms it;
// a second click within the same render actually deletes.
function DeleteAccountControl() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirmDelete() {
    setStatus("pending");
    setErrorMessage(null);
    // deleteUser is enabled with no password (see auth.config.ts — every
    // account here is Google-only) and instead requires a "fresh" session.
    // If the user hasn't signed in within session.freshAge, BetterAuth
    // rejects this with SESSION_EXPIRED rather than deleting, so we surface
    // that as a message rather than a silent failure.
    const { error } = await authClient.deleteUser();
    if (error) {
      setStatus("error");
      setErrorMessage(error.message ?? "Couldn't delete your account. Please try again.");
      return;
    }
    // On success BetterAuth clears the session cookie itself; useSession()
    // will pick that up and this whole branch stops rendering.
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-400">
          {errorMessage ?? "Delete your account? This can't be undone."}
        </span>
        {!errorMessage && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-400 text-red-400 hover:bg-red-950"
              disabled={status === "pending"}
              onClick={handleConfirmDelete}
            >
              {status === "pending" ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        )}
        {errorMessage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirming(false);
              setStatus("idle");
              setErrorMessage(null);
            }}
          >
            Dismiss
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirming(true)}>
      Delete account
    </Button>
  );
}
