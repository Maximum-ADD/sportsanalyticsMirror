import { Link } from "react-router-dom";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Marquee } from "@/components/landing/Marquee";
import { ScreenshotPlaceholder } from "@/components/landing/ScreenshotPlaceholder";
import { SectionPhoto } from "@/components/landing/SectionPhoto";

const APP_HOME = "/home";

const DEVELOPERS = ["Owen Pace", "Josh Sawyer", "Adrian Draxl", "Daniel Passos", "Kiran Soodyall", "Sanele Hlatshwayo"];

const TECH_STACK = [
  "React 19",
  "TypeScript",
  "Vite",
  "Tailwind CSS",
  "TanStack Query",
  "NestJS",
  "Prisma",
  "PostgreSQL",
  "BetterAuth",
  "Recharts",
  "Vitest",
  "Docker",
  "Gitea Actions",
];

const HERO_CASCADE = [
  { label: "Players list", left: "29%", top: "0%" },
  { label: "Player profile", left: "0%", top: "26%" },
  { label: "Optimizer", left: "29%", top: "57%" },
];

const PANEL_WIDTH = "71%";

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-landing-hero">
      <LandingHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <section className="relative overflow-hidden bg-landing-hero">
          <SectionPhoto name="court-player" narrowName="court-player-narrow" priority />
          <div className="relative mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-14 px-6 pt-44 pb-16 md:pt-36 lg:grid-cols-[1.2fr_0.8fr] lg:gap-8 lg:px-14 lg:pt-44 lg:pb-24">
            <div className="lg:pl-14">
              <h1 className="font-display text-[clamp(2.75rem,6.4vw,6.75rem)] leading-[1.12] tracking-[-0.02em] whitespace-nowrap uppercase">
                <span className="block text-landing-accent">NBA</span>
                <span className="hero-outline-text block">Fantasy League</span>
                <span className="block text-black">Optimizer</span>
              </h1>
              <Link
                to={APP_HOME}
                className="leather-texture mt-10 inline-flex h-14 min-w-[15rem] items-center justify-center px-10 text-xl font-bold tracking-[0.06em] text-white shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
              >
                Get Started
              </Link>
            </div>
            <div className="relative mx-auto aspect-[403/370] w-full max-w-[36rem] lg:mx-0 lg:ml-auto">
              {HERO_CASCADE.map((panel) => (
                <ScreenshotPlaceholder
                  key={panel.label}
                  ratio={16 / 9}
                  label={panel.label}
                  className="absolute"
                  style={{ left: panel.left, top: panel.top, width: PANEL_WIDTH }}
                />
              ))}
            </div>
          </div>
        </section>
        <Marquee items={DEVELOPERS} label="Development team" variant="symbiote" />
        <section className="relative overflow-hidden bg-landing-dark">
          <SectionPhoto name="court-dribble" />
          <div className="relative mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-[0.44fr_0.56fr] md:gap-10 lg:px-14 lg:py-24">
            <ScreenshotPlaceholder ratio={441 / 482} label="Team dashboard" className="w-full" />
            <div className="text-center">
              <h2 className="font-display text-[clamp(2.5rem,5.6vw,6rem)] leading-none tracking-[-0.01em] text-white uppercase">
                What We Do
              </h2>
              <p className="mt-8 text-lg text-white/90">Most basketball stats sites stop at showing you the numbers. We derive every statistic from individual game events rather than trusting precomputed totals, so the data holds up under scrutiny. Every prediction comes with the stats that produced it and a published accuracy record against games already played and we go past forecasting to recommending the lineup that actually moves your odds.</p>
            </div>
          </div>
        </section>
        <Marquee items={TECH_STACK} label="Our tech stack" variant="crystal" />
        <section className="relative overflow-hidden bg-landing-light">
          <SectionPhoto name="court-layup" />
          <div className="relative mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-[0.58fr_0.42fr] md:gap-10 lg:px-14 lg:py-24">
            <ScreenshotPlaceholder
              ratio={287 / 460}
              label="Predictions"
              className="w-full max-w-[22rem] justify-self-center md:order-2 md:justify-self-end"
            />
            <div className="md:order-1 lg:pl-14">
              <h2 className="font-display text-[clamp(2.5rem,5.6vw,6rem)] leading-[1.7] tracking-[-0.01em] text-landing-accent uppercase">
                <span className="block">How We</span>
                <span className="block">Stand Out</span>
              </h2>
              <p className="mt-6 text-lg text-landing-ink/80">NBA Analytics & Optimisation Engine builds team and player profiles from event-level game data,2 every statistic derived from individual game events, not lifted from precomputed league totals. Browse, compare, and see the numbers behind the numbers. Outcome prediction and lineup optimisation are in active development.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
