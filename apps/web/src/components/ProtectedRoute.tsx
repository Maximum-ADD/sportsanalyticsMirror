import type { ReactNode } from "react";
import { signInWithGoogle, useSession } from "@/lib/authClient";
import { AuthBootScreen } from "@/components/ui/loading-overlay";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <AuthBootScreen />;
  }

  if (!session) {
    return (
      <div className="flex min-h-full items-center justify-center bg-landing-hero">
        <section className="mx-auto flex max-w-lg flex-col items-center gap-4 border border-landing-light bg-locker-surface px-8 py-10 text-center">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Sign in required</h1>
          <p className="text-[12.5px] text-locker-ink-muted">Sign in to access this page.</p>
          <button
            type="button"
            onClick={() => signInWithGoogle(window.location.href)}
            className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
          >
            Sign in with Google
          </button>
        </section>
      </div>
    );
  }

  return children;
}
