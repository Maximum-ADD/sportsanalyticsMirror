import { authClient, useSession } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthStatus() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-full" />;
  }

  if (!session) {
    return (
      <Button
        type="button"
        className="w-full"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: window.location.href })}
      >
        Sign in with Google
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <span className="truncate text-sm text-text-secondary" title={session.user.email}>
        {session.user.email}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </div>
  );
}
