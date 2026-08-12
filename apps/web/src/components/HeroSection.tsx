import { HeroCta } from "./HeroCta";
import { HeroHeadline } from "./HeroHeadline";
import { HeroPhoto } from "./HeroPhoto";

// Smaller pl-* moves the headline left, larger moves it right.
const HEADLINE_LINES = ["Sports", "Analytics", "Platform"] as const;
const CONTENT_INSET = "pl-32 pr-4 sm:pl-6 lg:pl-32 xl:pl-32";
const CONTENT_WIDTH = "max-w-2xl";

export function HeroSection() {
  return (
    // overflow-x-clip, not overflow-hidden: hidden would also clip vertically
    // and make this a scroll container.
    <section className="relative isolate flex min-h-[calc(100svh-5rem)] items-center overflow-x-clip">
      <HeroPhoto />

      {/* Replacement image goes here — after HeroPhoto so it paints on top.
          Add aria-hidden + pointer-events-none if it is decorative. */}

      <div className={`relative w-full py-16 lg:py-24 ${CONTENT_INSET}`}>
        <div className={`min-w-0 ${CONTENT_WIDTH}`}>
          <HeroHeadline lines={HEADLINE_LINES} />

          <p className="mt-6 max-w-md text-sm text-text-secondary sm:text-base">
            Team and player statistics for every game, derived from play-by-play event data rather
            than typed-in totals.
          </p>

          <div className="mt-9">
            <HeroCta to="/home">Get Started</HeroCta>
          </div>
        </div>
      </div>
    </section>
  );
}
