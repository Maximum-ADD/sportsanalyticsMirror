import { type ReactNode } from "react";
import { Link } from "react-router-dom";
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

  return (
    <header className="relative inset-x-0 top-0 z-20 shrink-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-30 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
      >
        Skip to content
      </a>
      <div className="flex h-14 items-center gap-x-6 bg-landing-ink px-6 lg:px-14">
        <Link
          to="/"
          aria-label="Court Vision, home"
          className="flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent"
        >
          <FlameBallLogo className="h-7" />
        </Link>
        {/* The link row is the one part of the header allowed to scroll: at
            phone widths six nowrap links cannot fit, and letting them blow
            out the row instead both overflows the page horizontally and
            (via flex shrink) squeezes AuthStatus until its button wraps
            into a tall block. flex-1 + overflow-x-auto keeps every link
            reachable by swiping, while AuthStatus stays pinned at full
            size. */}
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-x-6 lg:gap-x-10">
          <ul className="flex flex-1 items-center gap-x-6 overflow-x-auto scrollbar-none lg:gap-x-10">
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
          <div className="ml-auto flex shrink-0 items-center">
            <AuthStatus signInCallbackURL={signInCallbackURL} />
          </div>
        </nav>
      </div>
    </header>
  );
}
