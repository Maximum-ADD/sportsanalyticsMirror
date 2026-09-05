import type { ReactNode } from "react";
import { signInWithGoogle, useSession } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="mx-auto flex min-h-80 max-w-lg items-center justify-center px-6">
        <BasketballSpinner size="lg" label="Loading" />
      </div>
    );
  }

  if (!session) {
    return (
      <section className="mx-auto flex min-h-80 max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Sign in required</h1>
        <p className="text-text-secondary">Sign in to access this page.</p>
        <Button type="button" onClick={() => signInWithGoogle(window.location.href)}>
          Sign in with Google
        </Button>
      </section>
    );
  }

  return children;
}
