import { Link } from "react-router-dom";
import { AuthStatus } from "@/components/AuthStatus";
import { FlameBallLogo } from "./FlameBallLogo";
import { LandingMatchWidget } from "./LandingMatchWidget";

const APP_LINKS = [
  { label: "Home", to: "/home" },
  { label: "Players", to: "/players" },
  { label: "Compare", to: "/compare" },
  { label: "Teams", to: "/teams" },
  { label: "Optimizer", to: "/optimizer" },
  { label: "Predictions", to: "/predictions" },
];

const LINK_CLASS =
  "text-[11px] font-medium tracking-[0.2em] whitespace-nowrap text-white uppercase transition-colors hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent";

interface LandingHeaderProps {
  overlaysContent?: boolean;
  signInCallbackURL?: string;
}

export function LandingHeader({ overlaysContent = false, signInCallbackURL }: LandingHeaderProps) {
  return (
    <header className={`${overlaysContent ? "absolute" : "relative"} inset-x-0 top-0 z-20 shrink-0`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-30 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
      >
        Skip to content
      </a>
      <div className="relative flex h-14 items-center gap-x-6 bg-landing-ink px-6 lg:px-14">
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
          <div className="ml-auto flex items-center">
            <AuthStatus signInCallbackURL={signInCallbackURL} />
          </div>
        </nav>
      </div>
      {overlaysContent && (
        <div className="pointer-events-none absolute top-0 left-[67%] hidden -translate-x-1/2 md:block">
          <LandingMatchWidget />
        </div>
      )}
    </header>
  );
}
