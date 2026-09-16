import { useEffect, useId, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AuthStatus } from "@/components/AuthStatus";
import { useMe } from "@/lib/useMe";
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
  // everywhere": a slot for the landing page's compact match-updates
  // banner, rendered inline between the nav links and AuthStatus. Slotted
  // content is expected to fit inside the h-14 row (the widget renders at
  // h-10). Everything else about the header — links, logo, layout — stays
  // identical on every page.
  beforeAuthStatus?: ReactNode;
}

// The one app-shell header, shared by the landing page and every signed-in
// page alike (see AppLayout) — no per-page variants beyond beforeAuthStatus
// above, so "the header" otherwise always means the same look and the same
// links everywhere.
export function LandingHeader({ signInCallbackURL, beforeAuthStatus }: LandingHeaderProps) {
  // Admin is the one link that isn't always in the row — it only appears
  // for a signed-in admin, appended rather than spliced in anywhere else so
  // it doesn't shift every other link's position for everyone else.
  const { data: me } = useMe();
  const links = me?.role === "ADMIN" ? [...APP_LINKS, { label: "Admin", to: "/admin" }] : APP_LINKS;

  // Below lg the links live in a drawer behind a menu button instead of in
  // the row: seven nowrap links cannot fit a phone width, and the previous
  // swipe-to-scroll row hid most of them behind a gesture with no
  // affordance — every link was reachable in principle and invisible in
  // practice.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const { pathname } = useLocation();

  // Navigating is the drawer's success case, so it closes itself rather
  // than staying open over the page the user just asked for. Keyed on the
  // path so tapping the link for the current page still closes it.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Escape closes the drawer, matching what any other overlay on the page
  // does. Bound only while open so the header adds no global key handler
  // to every page in the app.
  useEffect(() => {
    if (!isMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  return (
    <header className="relative inset-x-0 top-0 z-20 shrink-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-30 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
      >
        Skip to content
      </a>
      <div className="flex h-14 items-center gap-x-3 bg-landing-ink px-4 sm:gap-x-6 sm:px-6 lg:px-14">
        <Link
          to="/"
          aria-label="Court Vision, home"
          className="flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent"
        >
          <FlameBallLogo className="h-7" />
        </Link>
        {/* One "Primary" landmark for both layouts: the in-row list and the
            drawer are two presentations of the same nav, and two landmarks
            with the same name would read as two different navigations to a
            screen reader. */}
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-x-6 lg:gap-x-10">
          <ul className="hidden flex-1 items-center gap-x-6 lg:flex lg:gap-x-10">
            {links.map((link) => (
              <li key={link.label} className="shrink-0">
                <Link to={link.to} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* The landing page's match banner slots in as a plain inline flex
              child between the links and AuthStatus, sized h-10 so it sits
              inside this h-14 row. No absolute anchoring or measurement is
              needed anymore — that rig only existed to hang the old,
              taller-than-the-bar card off the row's top edge. Hidden below
              xl: at narrower widths the nav links alone already crowd the
              row. */}
          {beforeAuthStatus && <div className="hidden shrink-0 xl:block">{beforeAuthStatus}</div>}
          <div className="ml-auto flex shrink-0 items-center gap-x-2 sm:gap-x-3">
            <AuthStatus signInCallbackURL={signInCallbackURL} />
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-expanded={isMenuOpen}
              aria-controls={menuId}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              // -mr-2 pulls the 44px touch target back to the row's optical
              // edge: the button needs the height to be tappable, the icon
              // inside it should still line up with the page gutter.
              className="-mr-2 flex size-11 items-center justify-center text-white transition-colors hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent lg:hidden"
            >
              {isMenuOpen ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
            </button>
          </div>
        </nav>
      </div>
      {/* Absolute rather than in flow so opening the drawer never pushes the
          page down — it sits over the content like every other menu. */}
      <div
        id={menuId}
        hidden={!isMenuOpen}
        className="absolute inset-x-0 top-14 border-t border-white/10 bg-landing-ink shadow-[0_18px_30px_rgba(0,0,0,0.35)] lg:hidden"
      >
        <ul className="flex flex-col px-4 py-2 sm:px-6">
          {links.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                // Full-row links at a 44px minimum: the drawer is the only
                // way to these routes on a phone, so each target is sized
                // for a thumb rather than for a cursor.
                className={`flex min-h-11 items-center border-b border-white/10 last:border-b-0 ${LINK_CLASS}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
