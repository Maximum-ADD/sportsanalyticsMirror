import { Link, NavLink } from "react-router-dom";
import { AuthStatus } from "./AuthStatus";
import { BasketballIcon } from "./BasketballIcon";
import { RecentResultWidget } from "./RecentResultWidget";

const NAV_LINKS = [
  { to: "/home", label: "Home" },
  { to: "/players", label: "Players" },
  { to: "/teams", label: "Teams" },
  { to: "/optimizer", label: "Optimizer" },
  { to: "/predictions", label: "Predictions" },
];

export function Navbar() {
  return (
    <div className="relative">
      <div className="flex h-8 items-center border-b border-border-subtle/60 bg-surface-base px-6">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
          NBA Fantasy League Optimizer
        </span>
      </div>

      <header className="relative flex h-20 shrink-0 items-center gap-10 border-b border-border-subtle bg-surface-nav px-6 shadow-[0_4px_16px_rgba(0,0,0,0.45)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-20 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
        >
          Skip to content
        </a>

        <Link to="/home" className="flex shrink-0 items-center gap-2 text-text-primary">
          <BasketballIcon className="size-8 shrink-0" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/home"}
              className={({ isActive }) =>
                `text-sm font-bold uppercase tracking-[0.18em] transition-colors ${
                  isActive ? "text-brand-accent" : "text-text-primary hover:text-brand-accent"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Was absolutely centered on the full header (left-1/2), independent
            of the nav's actual width — that overlapped the nav once a 5th
            link (Predictions) made the nav wide enough to reach the header's
            midpoint. Placing it in the normal flex flow, pushed to the right
            alongside the auth button, can't overlap the nav regardless of
            how many links it has. */}
        <div className="ml-auto hidden items-center gap-8 md:flex">
          <RecentResultWidget />
          <AuthStatus />
        </div>
        <div className="flex items-center gap-8 md:hidden">
          <AuthStatus />
        </div>
      </header>
    </div>
  );
}
