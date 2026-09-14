import { useId } from "react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/useCountUp";
import { useInView } from "@/lib/useInView";
import { SectionPhoto } from "./SectionPhoto";

// The worked example is computed from the app's own tuned constants (see
// apps/predictor/elo.py) rather than hand-drawn, so the landing page can
// never drift from what the model actually does.
const ELO_DIVISOR = 400;
const HOME_COURT_ADVANTAGE_ELO = 40;
const EXAMPLE_RATING_GAP = 100;

// The Elo logistic win-probability formula, home team's perspective —
// mirrors elo.py's expected_win_probability.
function expectedHomeWinProbability(ratingGap: number): number {
  return 1 / (1 + 10 ** (-(ratingGap + HOME_COURT_ADVANTAGE_ELO) / ELO_DIVISOR));
}

// 1 / (1 + 10^(-(100 + 40) / 400)) ≈ 0.69 — "about seven wins in ten".
const EXAMPLE_HOME_WIN_PERCENTAGE = Math.round(expectedHomeWinProbability(EXAMPLE_RATING_GAP) * 100);
const EXAMPLE_AWAY_WIN_PERCENTAGE = 100 - EXAMPLE_HOME_WIN_PERCENTAGE;

// Same illustrative season as PredictionsPage's own explainer — one
// composition reused in both places so the landing preview and the in-app
// explainer read as the same product.
const ELO_SEASON_LINE_POINTS = "0,80 30,72 60,74 90,50 120,55 150,30 180,36 210,18 240,22 280,8";
const ELO_CHART_WIDTH = 280;
const ELO_CHART_GRID_LINES = [0, 27.5, 55, 82.5, 110];
const ELO_SEASON_RESULTS = [
  { x: 30, y: 72, won: true },
  { x: 90, y: 50, won: true },
  { x: 150, y: 30, won: true },
  { x: 180, y: 36, won: false },
  { x: 280, y: 8, won: true },
];

// Illustrative factor values (a strong team against a typical opponent),
// matching PredictionsPage's explainer rows.
const FOUR_FACTOR_ROWS = [
  { label: "Effective shooting", detail: "Shots made, weighted for 3s", thisTeam: 78, opponent: 61 },
  { label: "Turnover rate", detail: "Lower is better — fewer giveaways", thisTeam: 45, opponent: 58 },
  { label: "Free-throw rate", detail: "How often they get to the line", thisTeam: 32, opponent: 40 },
];

// The Elo line "draws" left to right by sliding its dash pattern: the dash
// length only needs to exceed the polyline's full length (~250 units), and
// offsetting by that same amount hides the line entirely. Done with
// dasharray rather than pathLength because pathLength on <polyline> has
// patchy support across older evergreen browsers.
const ELO_LINE_DASH_LENGTH = 300;

// Animation timings — the line draws first, dots pop in as it passes them
// (each dot's delay tracks its own x position), then the bars fill row by
// row. All are pure CSS transitions toggled by the section entering the
// viewport (see useInView), so nothing runs before it can be seen.
const LINE_DRAW_TRANSITION = "transition-[stroke-dashoffset] duration-[1600ms] ease-out motion-reduce:transition-none";
const DOT_FADE_TRANSITION = "transition-opacity duration-500 motion-reduce:transition-none";
const DOT_BASE_DELAY_IN_MS = 400;
const DOT_TRAIL_DELAY_IN_MS = 1200;
const BAR_FILL_TRANSITION = "transition-[width] duration-1000 ease-out motion-reduce:transition-none";
const BAR_BASE_DELAY_IN_MS = 400;
const BAR_STAGGER_IN_MS = 150;
const OPPONENT_BAR_OFFSET_IN_MS = 100;

/**
 * Entrance classes for the section's blocks, swapped in when it scrolls
 * into view — see useInView. Blocks stay hidden (opacity-0) until then so
 * applying the rise animation can never flash down from its final state.
 */
function buildRiseClasses(isInView: boolean, delayClass = ""): string {
  return isInView ? cn("landing-rise", delayClass) : "opacity-0";
}

interface ModelCardProps {
  isInView: boolean;
}

function EloCard({ isInView }: ModelCardProps) {
  return (
    <div className="border border-white/15 bg-landing-ink/70 p-6 lg:p-8">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-locker-model" />
        <h3 className="font-display text-xl tracking-[0.01em] text-white uppercase">Win probability — Elo</h3>
      </div>
      <p className="mt-4 text-base leading-relaxed text-white/75">
        Every team carries a rating, built the way chess ratings are. Win and it climbs; lose and it falls — more
        when the result was a surprise. The gap between two ratings is the prediction.
      </p>
      <svg
        viewBox="0 0 280 110"
        role="img"
        aria-label="An illustrative team rating climbing after wins and dipping after losses across a season"
        className="mt-7 h-40 w-full"
      >
        {ELO_CHART_GRID_LINES.map((y) => (
          <line key={y} x1={0} y1={y} x2={ELO_CHART_WIDTH} y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        ))}
        <polyline
          points={ELO_SEASON_LINE_POINTS}
          fill="none"
          stroke="var(--color-locker-model)"
          strokeWidth={2.5}
          strokeDasharray={ELO_LINE_DASH_LENGTH}
          strokeDashoffset={isInView ? 0 : ELO_LINE_DASH_LENGTH}
          className={LINE_DRAW_TRANSITION}
        />
        {ELO_SEASON_RESULTS.map((result) => (
          <circle
            key={`${result.x}-${result.y}`}
            cx={result.x}
            cy={result.y}
            r={4.5}
            fill={result.won ? "var(--color-locker-good)" : "var(--color-locker-bad)"}
            stroke="var(--color-landing-ink)"
            strokeWidth={1.5}
            className={cn(DOT_FADE_TRANSITION, isInView ? "opacity-100" : "opacity-0")}
            style={{
              transitionDelay: `${DOT_BASE_DELAY_IN_MS + (result.x / ELO_CHART_WIDTH) * DOT_TRAIL_DELAY_IN_MS}ms`,
            }}
          />
        ))}
      </svg>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="font-mono text-[10px] tracking-[0.12em] text-white/60 uppercase">
          One team&apos;s rating, game by game
        </p>
        <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.1em] text-white/60 uppercase">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-locker-good" /> Win — rating rises
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-locker-bad" /> Loss — rating falls
          </span>
        </div>
      </div>
    </div>
  );
}

function FourFactorsCard({ isInView }: ModelCardProps) {
  return (
    <div className="border border-white/15 bg-landing-ink/70 p-6 lg:p-8">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-locker-leather" />
        <h3 className="font-display text-xl tracking-[0.01em] text-white uppercase">Predicted margin — Four Factors</h3>
      </div>
      <p className="mt-4 text-base leading-relaxed text-white/75">
        Analyst Dean Oliver showed that most of what separates winners from losers comes down to a few habits:
        shooting efficiently, protecting the ball, and getting to the line. Compare two teams&apos; running averages
        on those habits and you have a margin.
      </p>
      <div className="mt-8 space-y-6">
        {FOUR_FACTOR_ROWS.map((row, rowIndex) => (
          <div key={row.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[10px] tracking-[0.12em] text-white/70 uppercase">{row.label}</span>
              <span className="text-xs text-white/45">{row.detail}</span>
            </div>
            <div className="mt-2 flex h-2.5 gap-1">
              <span
                className={cn("block h-full bg-locker-leather", BAR_FILL_TRANSITION)}
                style={{
                  width: isInView ? `${row.thisTeam}%` : "0%",
                  transitionDelay: `${BAR_BASE_DELAY_IN_MS + rowIndex * BAR_STAGGER_IN_MS}ms`,
                }}
              />
              <span
                className={cn("block h-full bg-white/20", BAR_FILL_TRANSITION)}
                style={{
                  width: isInView ? `${row.opponent}%` : "0%",
                  transitionDelay: `${BAR_BASE_DELAY_IN_MS + rowIndex * BAR_STAGGER_IN_MS + OPPONENT_BAR_OFFSET_IN_MS}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-4 font-mono text-[10px] tracking-[0.1em] text-white/60 uppercase">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 bg-locker-leather" /> This team
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 bg-white/20" /> Opponent
        </span>
      </div>
    </div>
  );
}

function WorkedExampleCard({ isInView }: ModelCardProps) {
  const favouritePercentage = useCountUp(EXAMPLE_HOME_WIN_PERCENTAGE, isInView);
  const underdogPercentage = useCountUp(EXAMPLE_AWAY_WIN_PERCENTAGE, isInView);

  return (
    <div className="border border-white/15 bg-landing-ink/70 p-6 lg:p-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="font-display text-xl tracking-[0.01em] text-white uppercase">See it work</h3>
        <p className="font-mono text-[10px] tracking-[0.14em] text-white/60 uppercase">
          A side rated {EXAMPLE_RATING_GAP} Elo points better, playing at home
        </p>
      </div>

      <div className="mt-7 flex items-center gap-5">
        <p className="w-20 shrink-0 text-right font-display text-4xl leading-none text-landing-accent tabular-nums">
          <span>{favouritePercentage}</span>
          <span className="text-xl">%</span>
        </p>
        <div
          role="img"
          aria-label={`Win probability split: the higher-rated home side ${EXAMPLE_HOME_WIN_PERCENTAGE} percent, the lower-rated side ${EXAMPLE_AWAY_WIN_PERCENTAGE} percent`}
          className="flex h-3 flex-1 bg-white/15"
        >
          <span
            className={cn("block h-full bg-landing-accent", BAR_FILL_TRANSITION)}
            style={{ width: isInView ? `${EXAMPLE_HOME_WIN_PERCENTAGE}%` : "0%" }}
          />
        </div>
        <p className="w-20 shrink-0 font-display text-4xl leading-none text-white tabular-nums">
          <span>{underdogPercentage}</span>
          <span className="text-xl">%</span>
        </p>
      </div>
      <div className="mt-2.5 flex justify-between font-mono text-[9px] tracking-[0.12em] text-white/55 uppercase">
        <span>Higher-rated side, at home</span>
        <span>Lower-rated side</span>
      </div>

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/75">
        Roughly seven wins in ten — and not a guess. That number is the Elo formula with this app&apos;s own tuned
        home-court constant, the same one running against every live game on the site.
      </p>
    </div>
  );
}

// Landing-page band explaining the two models behind every prediction
// (mirroring PredictionsPage's own "How it works" explainer), with charts
// that animate in as the section scrolls into view. The background is a
// grainy black-and-white gym photo (Marius Christensen / Unsplash) held
// under a near-black scrim — it reads as texture behind the charts rather
// than competing with them, and its top/bottom edges fade to full ink so
// the band still melts into the black reels around it.
export function ModelExplainer() {
  const headingId = useId();
  // Replay mode: leaving the viewport resets the charts to their starting
  // poses, so scrolling back re-runs the whole sequence — line draw, bar
  // fills, count-ups — instead of sitting at its finished state.
  const { elementRef, isInView } = useInView<HTMLElement>({ replay: true });

  return (
    <section ref={elementRef} aria-labelledby={headingId} className="relative overflow-hidden bg-landing-ink">
      <SectionPhoto name="drew-league" narrowName="drew-league-narrow" />
      {/* The scrim sits heavier at the top and bottom (full ink) so the band
          keeps its flat-break relationship with the black reels above and
          below, while the middle shows the most photo. */}
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-landing-ink via-landing-ink/85 to-landing-ink" />
      <div className="mx-auto w-full max-w-[1500px] px-6 py-20 lg:px-14 lg:py-28">
        <div className={buildRiseClasses(isInView)}>
          <p className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase">Inside the model</p>
          <h2
            id={headingId}
            className="mt-4 font-display text-[clamp(2.5rem,5.6vw,6rem)] leading-[1.05] tracking-[-0.01em] text-white uppercase"
          >
            How We Predict
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            Two simple ideas produce every prediction on Court Vision. No black box, no secret weights — a rating
            that learns from every result, and the few habits that actually decide basketball games.
          </p>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <div className={buildRiseClasses(isInView, "landing-rise-delay-1")}>
            <EloCard isInView={isInView} />
          </div>
          <div className={buildRiseClasses(isInView, "landing-rise-delay-2")}>
            <FourFactorsCard isInView={isInView} />
          </div>
        </div>

        <div className={cn("mt-8", buildRiseClasses(isInView, "landing-rise-delay-3"))}>
          <WorkedExampleCard isInView={isInView} />
        </div>

        <p
          className={cn(
            "mt-10 font-mono text-[10px] tracking-[0.14em] text-white/50 uppercase",
            buildRiseClasses(isInView)
          )}
        >
          Every constant tuned and backtested game-by-game against ~3,780 real NBA games across three seasons
        </p>
      </div>
    </section>
  );
}
