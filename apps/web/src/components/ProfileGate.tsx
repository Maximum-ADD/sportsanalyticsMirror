import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "@/lib/useMe";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";

interface ProfileGateProps {
  children: ReactNode;
}

// Sits inside ProtectedRoute (so a signed-out visitor still sees the
// sign-in prompt first, not this) — redirects a signed-in user who hasn't
// completed onboarding (GET /v1/me's username is null) to /onboarding
// before they can reach anything else under the app shell. /onboarding
// itself is wrapped in ProtectedRoute only, never in this gate, or a user
// mid-onboarding would be bounced right back into the flow they're already
// on.
export function ProfileGate({ children }: ProfileGateProps) {
  const { data: me, isPending } = useMe();

  if (isPending) {
    return (
      <div className="mx-auto flex min-h-80 max-w-lg items-center justify-center px-6">
        <BasketballSpinner size="lg" label="Loading" />
      </div>
    );
  }

  if (me && me.username === null) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
