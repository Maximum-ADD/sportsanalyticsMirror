import { Link } from "react-router-dom";
import { AuthStatus } from "@/components/AuthStatus";
import { FlameBallLogo } from "./FlameBallLogo";
import { LandingMatchWidget } from "./LandingMatchWidget";

const PRIMARY_LINKS = [
  { label: "Home", to: "/home" },
  { label: "Players", to: "/players" },
  { label: "Compare", to: "/compare" },
  { label: "Teams", to: "/teams" },
];

const APP_LINKS = [
  ...PRIMARY_LINKS,
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
  const navigationLinks = overlaysContent ? PRIMARY_LINKS : APP_LINKS;

  return (
    <header className={`${overlaysContent ? "absolute" : "relative"} inset-x-0 top-0 z-20 shrink-0`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-30 focus:rounded-md focus:bg-brand-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-accent-foreground"
      >
        Skip to content
      </a>
      <div
        className={`relative flex items-center gap-x-6 gap-y-2 bg-landing-ink px-6 lg:px-14 ${
          overlaysContent ? "flex-wrap pt-3 pb-10" : "h-14"
        }`}
      >
        <Link
          to="/"
          aria-label="Court Vision, home"
          className="flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent"
        >
          <FlameBallLogo className={overlaysContent ? "h-11 lg:h-12" : "h-7"} />
          <span className="text-[10.5px] font-medium tracking-[0.2em] text-white uppercase">Court Vision</span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 items-center gap-x-6 lg:gap-x-10">
          <ul className="flex items-center gap-x-6 lg:gap-x-10">
            {navigationLinks.map((link) => (
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
