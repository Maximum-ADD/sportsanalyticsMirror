import type { ReactNode } from "react";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { cn } from "@/lib/utils";

interface PageLoadingProps {
  label?: string;
}

// The page has nothing on screen yet — no shell, no content, nothing to
// blur. Used only for a true empty first paint; the moment any real
// content exists (even if other sections are still loading), reach for
// SectionLoading below instead so the rest of the page stays visible.
export function PageLoading({ label = "Loading" }: PageLoadingProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BasketballSpinner size="lg" label={label} />
    </div>
  );
}

// The one loading screen for the whole auth-boot sequence: the nested gate
// chain ProtectedRoute -> ProfileGate each render THIS while their own
// query pends. Both gates must stay visually identical — a fresh page load
// runs them back to back, and if the later gate styled its pending state
// differently (ProfileGate once used a transparent card over the dark app
// shell), the loader visibly "replayed" — ball restarting on a new
// background — instead of reading as one continuous loading screen.
export function AuthBootScreen() {
  return (
    <div className="flex min-h-full items-center justify-center bg-landing-hero">
      <BasketballSpinner size="lg" label="Loading" />
    </div>
  );
}

interface SectionLoadingProps {
  loading: boolean;
  label?: string;
  className?: string;
  children: ReactNode;
}

// One section of an already-visible page is fetching or re-fetching —
// its last content (or an empty placeholder shape, from the caller) stays
// on screen, blurred, with a shimmer sweeping across it as the only
// loading signal. No spinner here: a ball bouncing inside a blurred
// section reads as broken (see the loading-language rework this replaced),
// and a page with several sections loading at once would otherwise show
// several independent balls bouncing simultaneously.
export function SectionLoading({ loading, label = "Loading", className, children }: SectionLoadingProps) {
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden={loading} className={loading ? "pointer-events-none blur-sm" : undefined}>
        {children}
      </div>
      {loading && (
        <div role="status" aria-label={label} className="absolute inset-0 overflow-hidden">
          <div className="animate-shimmer absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
      )}
    </div>
  );
}
