import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { LandingHeader } from "./landing/LandingHeader";
import { ReadAloudControl } from "./ReadAloudControl";

export function AppLayout() {
  return (
    // h-dvh, not h-screen: on mobile browsers 100vh is the viewport with the
    // URL bar collapsed, so a h-screen shell is taller than what is actually
    // on screen and the bottom of every page sits under the browser chrome.
    // dvh tracks the visible viewport as that chrome shows and hides.
    <div className="flex h-dvh flex-col bg-landing-hero">
      <LandingHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        {/* Pages are lazy-loaded (see App.tsx). The boundary sits inside
            main so the header stays put while a page's code downloads, and
            only a first visit straight to a page shows it: React Router
            runs in-app navigations as transitions, which keep the current
            page on screen until the next one is ready. */}
        <Suspense fallback={<PageLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>
      {/* Sits outside the scrollable main so it stays put while the page
          scrolls; reads whatever main currently holds. */}
      <ReadAloudControl />
    </div>
  );
}

function PageLoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <BasketballSpinner size="lg" label="Loading page" />
    </div>
  );
}
