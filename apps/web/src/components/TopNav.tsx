import { Link } from "react-router-dom";
import { FlameBallIcon } from "./FlameBallIcon";
import { LiveMatchCard } from "./LiveMatchCard";

// Every link points at /home until the public Players/Teams pages and a sign-up
// flow exist. Plain Link rather than NavLink for that reason: with five
// identical hrefs, isActive would light all five at once under /home.
const PRIMARY_LINKS = [
  { to: "/home", label: "Home" },
  { to: "/home", label: "Players" },
  { to: "/home", label: "Teams" },
];

const ACCOUNT_LINKS = [
  { to: "/home", label: "Register" },
  { to: "/home", label: "Login" },
];

const linkClassName =
  "rounded-md px-1 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50";

export function TopNav() {
  return (
    // z-10 so the xl-only overhanging match card paints above the hero.
    <header className="relative z-10 border-b border-border-subtle bg-surface-nav">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-20 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
      >
        Skip to content
      </a>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 xl:flex-nowrap">
        {/* Static text, not a link: TopNav only renders on "/". min-w-0 lets it
            shrink instead of forcing the page wider than the viewport. */}
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          <FlameBallIcon aria-hidden className="size-8 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-bold uppercase tracking-wide text-text-primary">
              NBA Analytics
            </span>
            <span className="block truncate text-[10px] uppercase tracking-[0.2em] text-text-secondary">
              Event-derived stats
            </span>
          </span>
        </div>

        <nav aria-label="Primary" className="w-full xl:w-auto xl:flex-1">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 xl:justify-start">
            {PRIMARY_LINKS.map((link) => (
              // Keyed on label: all five hrefs are the same string.
              <li key={link.label}>
                <Link to={link.to} className={linkClassName}>
                  {link.label}
                </Link>
              </li>
            ))}
            {ACCOUNT_LINKS.map((link, index) => (
              <li key={link.label} className={index === 0 ? "xl:ml-auto" : undefined}>
                <Link to={link.to} className={linkClassName}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* In flow until xl, where there is a clear band across the bar for it. */}
        <LiveMatchCard className="w-full xl:absolute xl:left-1/2 xl:top-full xl:w-auto xl:-translate-x-1/2 xl:-translate-y-1/2" />
      </div>
    </header>
  );
}
