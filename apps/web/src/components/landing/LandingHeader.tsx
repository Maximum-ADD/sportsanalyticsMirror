import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AuthStatus } from "@/components/AuthStatus";
import { FlameBallLogo } from "./FlameBallLogo";

const APP_LINKS = [
  { label: "Home", to: "/home" },
  { label: "Players", to: "/players" },
  { label: "Compare", to: "/compare" },
  { label: "Teams", to: "/teams" },
  { label: "Optimizer", to: "/optimizer" },
  { label: "Predictions", to: "/predictions" },
];

const LINK_CLASS =
  "text-[11px] font-mono tracking-[0.2em] whitespace-nowrap text-white uppercase transition-colors hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent";

interface LandingHeaderProps {
  signInCallbackURL?: string;
  // The one deliberate per-page exception to "the header looks the same
  // everywhere": a slot for the landing page's live-match widget, rendered
  // inline between the nav links and AuthStatus. Everything else about the
  // header — links, logo, layout — stays identical on every page.
  beforeAuthStatus?: ReactNode;
}

// Gap kept between the widget's right edge and AuthStatus's left edge —
// same number used for both the initial CSS guess (before the real
// measurement lands) and the measured position below, so there's no visible
// jump between them.
const WIDGET_GAP_PX = 24;

// The one app-shell header, shared by the landing page and every signed-in
// page alike (see AppLayout) — no per-page variants beyond beforeAuthStatus
// above, so "the header" otherwise always means the same look and the same
// links everywhere.
export function LandingHeader({ signInCallbackURL, beforeAuthStatus }: LandingHeaderProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const authStatusRef = useRef<HTMLDivElement>(null);
  // Right offset (in px, from the header row's own right edge) that puts
  // the widget flush against AuthStatus's real left edge. AuthStatus's
  // rendered width varies (sign-in button vs. an avatar + username of
  // unpredictable length, only known once GET /v1/me resolves), so a fixed
  // Tailwind offset can't track it — this measures the real gap instead.
  // Starts null (rendered via the CSS fallback below) until the first
  // layout pass has real boxes to measure.
  const [widgetRightPx, setWidgetRightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!beforeAuthStatus) return;
    const rowEl = rowRef.current;
    const authStatusEl = authStatusRef.current;
    if (!rowEl || !authStatusEl) return;

    function measure() {
      const rowRect = rowEl!.getBoundingClientRect();
      const authStatusRect = authStatusEl!.getBoundingClientRect();
      setWidgetRightPx(rowRect.right - authStatusRect.left + WIDGET_GAP_PX);
    }

    measure();
    window.addEventListener("resize", measure);

    // AuthStatus's box changes width once useSession/useMe resolve (button
    // -> avatar+username) — a plain mount-time measurement would miss that
    // and leave the widget offset from the sign-in button's old position.
    // Not implemented in jsdom (the component's test environment) — real
    // browsers have had this since 2020, so this only ever skips in tests.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(authStatusEl);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [beforeAuthStatus]);

  return (
    <header className="relative inset-x-0 top-0 z-20 shrink-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-30 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
      >
        Skip to content
      </a>
      <div ref={rowRef} className="relative flex h-14 items-center gap-x-6 bg-landing-ink px-6 lg:px-14">
        <Link
          to="/"
          aria-label="Court Vision, home"
          className="flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent"
        >
          <FlameBallLogo className="h-7" />
        </Link>
        <nav aria-label="Primary" className="flex flex-1 items-center gap-x-6 lg:gap-x-10">
          <ul className="flex items-center gap-x-6 lg:gap-x-10">
            {APP_LINKS.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Positioned against the header ROW (this component's outer
              relative div, a real fixed h-14 box) rather than against
              AuthStatus's own wrapper — anchoring to AuthStatus directly
              made the widget's vertical position track AuthStatus's own
              (shorter, content-sized) box instead of the header's true
              edge. top-3 overlaps it down into the header from that row's
              real top. Horizontal position is the measured widgetRightPx
              once available; before that first layout pass, right-24
              (matching WIDGET_GAP_PX) is a reasonable guess for the
              sign-in button's width so there's no visible jump. absolute
              keeps the widget (much taller than this row) out of flex
              flow entirely: as a normal flex child, even with self-start,
              it would stretch nav/this row to its own height instead of
              just overhanging past them. Hidden below xl: at narrower
              widths the nav links alone already crowd the row, and this
              would only ever overlap them, not sit in real empty space. */}
          {beforeAuthStatus && (
            <div
              className="absolute top-3 hidden xl:block"
              style={{ right: widgetRightPx ?? WIDGET_GAP_PX }}
            >
              {beforeAuthStatus}
            </div>
          )}
          <div ref={authStatusRef} className="ml-auto flex items-center">
            <AuthStatus signInCallbackURL={signInCallbackURL} />
          </div>
        </nav>
      </div>
    </header>
  );
}
