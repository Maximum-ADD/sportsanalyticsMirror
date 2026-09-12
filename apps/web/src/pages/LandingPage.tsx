import { Link } from "react-router-dom";
import { signInWithGoogle, useSession } from "@/lib/authClient";
import { HeroCourtLines } from "@/components/landing/HeroCourtLines";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingMatchWidget } from "@/components/landing/LandingMatchWidget";
import { Marquee, type MarqueeItem } from "@/components/landing/Marquee";
import { ModelExplainer } from "@/components/landing/ModelExplainer";
import { Reveal, type RevealDelay } from "@/components/landing/Reveal";
import { SectionPhoto } from "@/components/landing/SectionPhoto";

const APP_HOME = "/home";

const DEVELOPERS: MarqueeItem[] = [
  { name: "Owen Pace" },
  { name: "Josh Sawyer" },
  { name: "Adrian Draxl" },
  { name: "Daniel Passos" },
  { name: "Kiran Soodyall" },
  { name: "Sanele Hlatshwayo" },
];

// Every stack ships a logo from /logos; the Marquee still renders a blank
// slot for any future entry added without one.
const TECH_STACK: MarqueeItem[] = [
  { name: "React 19", logo: "/logos/react.webp" },
  { name: "TypeScript", logo: "/logos/typescript.webp" },
  { name: "Vite", logo: "/logos/vite.webp" },
  { name: "Tailwind CSS", logo: "/logos/tailwind-css.svg" },
  { name: "TanStack Query", logo: "/logos/tanstack-query.png" },
  { name: "NestJS", logo: "/logos/nestjs.svg" },
  { name: "Prisma", logo: "/logos/prisma.png" },
  { name: "PostgreSQL", logo: "/logos/postgresql.webp" },
  { name: "BetterAuth", logo: "/logos/betterauth.png" },
  { name: "Recharts", logo: "/logos/recharts.png" },
  { name: "Vitest", logo: "/logos/vitest.webp" },
  { name: "Docker", logo: "/logos/docker.webp" },
  { name: "Gitea Actions", logo: "/logos/gitea.webp" },
];

const WHAT_WE_DO_ITEMS = [
  "Browse player and team profiles built from game-level data.",
  "Compare performances and see the numbers behind each result.",
  "Follow predictions and use lineup recommendations to plan your next move.",
];

// Stagger steps for the three items below, as Reveal delay indices.
const WHAT_WE_DO_ITEM_DELAYS: RevealDelay[] = [1, 2, 3];

interface StandOutPoint {
  name: string;
  detail: string;
}

// The four account features that define the signed-in workflow — the
// model-transparency points stay covered by the section's intro paragraph.
const STAND_OUT_POINTS: StandOutPoint[] = [
  {
    name: "Personal dashboard",
    detail: "Your home page gathers the games, predictions, and lineups you care about.",
  },
  {
    name: "Player watchlist",
    detail: "Follow players and jump back to their latest performances in one tap.",
  },
  {
    name: "Saved comparisons",
    detail: "Keep the matchups you want to revisit close at hand.",
  },
  {
    name: "Lineup planning",
    detail: "Balance salaries and positions while the optimizer builds your edge.",
  },
];

// Two columns of two: the stagger steps across each row, then repeats.
const STAND_OUT_POINT_DELAYS: RevealDelay[] = [1, 2, 2, 3];

interface GetStartedProps {
  signInCallbackURL: string;
}

function GetStarted({ signInCallbackURL }: GetStartedProps) {
  const { data: session, isPending } = useSession();
  // Solid brand-accent fill (not the former translucent black) so the one
  // call to action on the page reads as the primary control from a distance.
  const className = "mt-10 inline-flex min-h-14 min-w-52 items-center justify-center bg-brand-accent px-8 py-4 font-mono text-sm tracking-[0.14em] text-brand-accent-foreground uppercase shadow-[0_8px_22px_rgba(0,0,0,0.28)] transition-colors hover:bg-brand-accent-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent disabled:cursor-wait disabled:opacity-70";

  if (session) {
    return <Link to={APP_HOME} className={className}>Get Started</Link>;
  }

  return (
    <button
      type="button"
      className={className}
      disabled={isPending}
      onClick={() => signInWithGoogle(signInCallbackURL)}
    >
      Get Started
    </button>
  );
}

export function LandingPage() {
  const appHomeURL = new URL(APP_HOME, window.location.origin).href;

  return (
    <div className="flex min-h-screen flex-col bg-landing-ink">
      <LandingHeader signInCallbackURL={appHomeURL} beforeAuthStatus={<LandingMatchWidget />} />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* Hero: the photo fills the whole first screen (object-cover — the
            variants ship pre-cropped 16:9 / 8:11 so nothing letterboxes) and
            a left-to-right scrim keeps the left column readable over the
            evening-game shadows. */}
        <section className="relative overflow-hidden bg-landing-dark">
          <SectionPhoto name="game-hoop" narrowName="game-hoop-narrow" priority />
          <div aria-hidden className="absolute inset-0 bg-linear-to-r from-black/80 via-black/40 to-black/10" />
          {/* Half-court geometry drawn faintly over the photo's right side,
              with a slow brand-accent comet lapping the boundary — the
              hero's echo of the What We Do scan line. Portrait phones show
              no court: the narrow photo fills that width on its own. */}
          <HeroCourtLines />
          <div className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-[1500px] items-center px-6 py-20 lg:px-14">
            <div className="max-w-2xl lg:pl-14">
              <Reveal as="p" className="font-mono text-xs tracking-[0.3em] text-white/80 uppercase">
                Court Vision
              </Reveal>
              <h1 className="mt-4 font-display text-[clamp(2.75rem,6.4vw,6.75rem)] leading-[1.12] tracking-[-0.02em] whitespace-nowrap uppercase">
                {/* Line one carries the ball-leather texture fill (see the
                    hero-leather-text utility); the other two lines keep their
                    solid orange / outline treatments. */}
                <Reveal as="span" className="hero-leather-text block">
                  NBA
                </Reveal>
                <Reveal as="span" delay={1} className="hero-outline-text block">
                  Fantasy League
                </Reveal>
                <Reveal as="span" delay={2} className="block text-white">
                  Optimizer
                </Reveal>
              </h1>
              <Reveal as="p" delay={2} className="mt-8 max-w-xl text-lg leading-relaxed text-white/90">
                Turn NBA game data into clearer decisions. Explore player and team profiles, compare performance, follow predictions, and build smarter fantasy lineups from the numbers behind every game.
              </Reveal>
              <Reveal delay={3}>
                <GetStarted signInCallbackURL={appHomeURL} />
              </Reveal>
            </div>
          </div>
        </section>
        <Marquee items={DEVELOPERS} label="Development team" variant="symbiote" />
        {/* What We Do: the dunk is the impact, so content hugs the bottom
            edge under a rising scrim instead of a floating panel — the
            dunker stays unobstructed in the upper half. */}
        <section className="relative overflow-hidden bg-landing-dark">
          <SectionPhoto name="street-dunk" narrowName="street-dunk-narrow" className="object-[center_20%]" />
          {/* The scrim runs heavier here than the hero's — the dunk photo's
              mid-tones (court, fence, buildings) sit right under the text,
              so the bottom third needs near-opaque before text at this size
              stays comfortable to read. */}
          <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/95 via-black/60 to-black/15" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[12%] hidden w-px overflow-hidden bg-white/15 md:block">
            <span className="landing-scan absolute inset-x-0 h-1/3 bg-brand-accent/80 blur-[1px]" />
          </div>
          <div className="relative mx-auto flex min-h-[48rem] w-full max-w-[1500px] items-end px-6 py-16 lg:min-h-[56rem] lg:px-14 lg:py-24">
            <div className="max-w-3xl lg:pl-14">
              <Reveal
                as="h2"
                className="font-display text-[clamp(3.5rem,7vw,8rem)] leading-none tracking-[-0.01em] text-white uppercase"
              >
                What We Do
              </Reveal>
              <Reveal as="p" delay={1} className="mt-8 text-xl leading-relaxed text-white/90 lg:text-2xl">
                Court Vision brings player research, team context, prediction tracking, and fantasy lineup planning into one place. Instead of stopping at a box score, it traces statistics back to the game events that produced them.
              </Reveal>
              <ul className="mt-12 grid gap-8 pb-2 md:grid-cols-3 lg:gap-10">
                {WHAT_WE_DO_ITEMS.map((item, index) => (
                  <Reveal
                    as="li"
                    key={item}
                    delay={WHAT_WE_DO_ITEM_DELAYS[index]}
                    className="border-t border-white/25 pt-5 text-lg leading-relaxed text-white/80 lg:text-xl"
                  >
                    <span className="font-mono text-sm tracking-[0.2em] text-brand-accent">
                      0{index + 1}
                    </span>
                    <p className="mt-2">{item}</p>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>
        {/* A thin rule so the dunk chapter and the model chapter read as two
            sections, not one continuous dark scroll. */}
        <div aria-hidden className="border-t border-white/15" />
        {/* How We Predict: charts that animate in on scroll (see
            ModelExplainer) over a black-and-white gym photo held under a
            near-black scrim — texture behind the model, not a competitor
            to it. */}
        <ModelExplainer />
        <Marquee items={TECH_STACK} label="Our tech stack" variant="crystal" />
        {/* How We Stand Out: back to a full-bleed photo — a dark Staples
            Center aerial (Marius Christensen / Unsplash) under a left-to-right
            scrim, with the four key account points set in the same
            numbered-list treatment as What We Do, as a 2x2 grid. */}
        <section className="relative overflow-hidden bg-landing-dark">
          <SectionPhoto name="clippers-arena" narrowName="clippers-arena-narrow" />
          <div aria-hidden className="absolute inset-0 bg-linear-to-r from-black/85 via-black/50 to-black/10" />
          <div className="relative mx-auto flex min-h-[40rem] w-full max-w-[1500px] items-center px-6 py-16 lg:min-h-[46rem] lg:px-14">
            <div className="max-w-2xl lg:pl-14">
              <Reveal
                as="h2"
                className="font-display text-[clamp(2.5rem,5.6vw,6rem)] leading-[1.05] tracking-[-0.01em] text-landing-accent uppercase"
              >
                <span className="block">How We</span>
                <span className="block">Stand Out</span>
              </Reveal>
              <Reveal as="p" delay={1} className="mt-6 text-xl leading-relaxed text-white/90">
                Every prediction is paired with the statistics that shaped it and measured against games already played. That gives you context instead of a black-box answer, whether you are checking a player, weighing a matchup, or planning a lineup.
              </Reveal>
              <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2">
                {STAND_OUT_POINTS.map((point, index) => (
                  <Reveal
                    as="li"
                    key={point.name}
                    delay={STAND_OUT_POINT_DELAYS[index]}
                    className="border-t border-white/25 pt-5"
                  >
                    <span className="font-mono text-sm tracking-[0.2em] text-brand-accent">
                      0{index + 1}
                    </span>
                    <h3 className="mt-2 font-display text-lg tracking-[0.06em] text-white uppercase">
                      {point.name}
                    </h3>
                    <p className="mt-2 text-lg leading-relaxed text-white/80">{point.detail}</p>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
