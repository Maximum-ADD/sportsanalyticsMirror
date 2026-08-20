import { authClient, signInWithGoogle, useSession } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthStatus() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-28" />;
  }

  if (!session) {
    return (
      <Button
        type="button"
        onClick={() => signInWithGoogle()}
      >
        Sign in with Google
      </Button>
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
    </div>
  );
}
