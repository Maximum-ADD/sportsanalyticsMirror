import { Link, NavLink } from "react-router-dom";
import { AuthStatus } from "./AuthStatus";
import { BasketballIcon } from "./BasketballIcon";
import { RecentResultWidget } from "./RecentResultWidget";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/players", label: "Players" },
  { to: "/teams", label: "Teams" },
  { to: "/optimizer", label: "Optimizer" },
];

export function Navbar() {
  return (
    <div className="relative">
      <div className="flex h-8 items-center border-b border-border-subtle/60 bg-surface-base px-6">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
          Sport Analytics/Project Name
        </span>
      </div>

      <header className="relative flex h-20 shrink-0 items-center gap-10 border-b border-border-subtle bg-surface-nav px-6 shadow-[0_4px_16px_rgba(0,0,0,0.45)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-20 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
        >
          Skip to content
        </a>

        <Link to="/" className="flex shrink-0 items-center gap-2 text-text-primary">
          <BasketballIcon className="size-8 shrink-0" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
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

        <div className="absolute left-1/2 top-1 z-10 hidden -translate-x-1/2 md:block">
          <RecentResultWidget />
        </div>

        <div className="ml-auto flex items-center gap-8">
          <AuthStatus />
        </div>
      </header>
    </div>
  );
}
