import type { ReactNode } from "react";
import { useMe } from "@/lib/useMe";
import { AuthBootScreen } from "@/components/ui/loading-overlay";

interface AdminGateProps {
  children: ReactNode;
}

// Sits inside ProtectedRoute (so a signed-out visitor sees the sign-in
// prompt first, not this) — blocks anyone whose role isn't ADMIN with a
// plain "not authorized" message rather than redirecting, unlike
// ProfileGate's /onboarding bounce: there's no completable flow to send a
// non-admin into, so the message is the whole answer.
export function AdminGate({ children }: AdminGateProps) {
  const { data: me, isPending } = useMe();

  if (isPending) {
    return <AuthBootScreen />;
  }

  if (me?.role !== "ADMIN") {
    return (
      <div className="flex min-h-full items-center justify-center bg-landing-hero">
        <section className="mx-auto flex max-w-lg flex-col items-center gap-4 border border-landing-light bg-locker-surface px-8 py-10 text-center">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Admins only</h1>
          <p className="text-[12.5px] text-locker-ink-muted">
            This page is restricted to admin accounts.
          </p>
        </section>
      </div>
    );
  }

  return children;
}
