import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ComparisonTraitsRadar } from "@/components/ComparisonTraitsRadar";
import { ErrorState } from "@/components/ErrorState";
import { PlayerTraitsRadar } from "@/components/PlayerTraitsRadar";
import { PointsTrendChart } from "@/components/PointsTrendChart";
import { StatGlossaryInfo } from "@/components/StatGlossaryInfo";
import { StatTile } from "@/components/StatTile";
import { ProspectValueCard } from "@/components/becomepro/ProspectValueCard";
import { SeasonEntryPanel } from "@/components/becomepro/SeasonEntryPanel";
import { SeasonSetupForm } from "@/components/becomepro/SeasonSetupForm";
import { DANGER_BUTTON_CLASS, QUIET_BUTTON_CLASS } from "@/components/becomepro/styles";
import { LockerSection } from "@/components/home/LockerSection";
import { BECOME_PRO_TUTORIAL } from "@/components/tutorial/definitions/becomeProTutorial";
import { PageTutorial } from "@/components/tutorial/PageTutorial";
import { Reveal } from "@/components/landing/Reveal";
import { PageLoading } from "@/components/ui/loading-overlay";
import { formatNumber, formatPercentage } from "@/lib/advancedStats";
import {
  MY_BECOME_PRO_QUERY_KEY,
  deleteProspectSeason,
  fetchMyBecomePro,
  invalidateBecomeProQueries,
} from "@/lib/becomeProApi";
import { NO_VALUE } from "@/lib/playerBio";
import { COMPETITION_LEVEL_LABELS, hasAttempts } from "@/lib/prospectValue";
import { isSmallSample } from "@/lib/seasonType";
import type {
  GameLogEntry,
  MyBecomePro,
  ProspectSeason,
  ProspectValuation,
  SeasonAverages,
  TraitsComparisonEntry,
} from "@/types/nba";

type Mode = "view" | "new" | "edit";

/**
 * Become Pro — the signed-in user's own page.
 *
 * Log your games, see what the season projects to against the NBA rookie
 * salary scale, and see which real NBA rookies your game most resembles.
 *
 * Private: nobody else can see this page or anything on it, and there is no
 * comparison between users — only between you and real NBA players. That is
 * why nothing here is verified: a self-reported figure only ever reaches the
 * person who reported it.
 */
export function BecomeProPage() {
  // undefined follows the most recent league year; set once the user picks a
  // season or starts a new one.
  const [seasonId, setSeasonId] = useState<string | undefined>(undefined);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...MY_BECOME_PRO_QUERY_KEY, seasonId ?? "latest"],
    queryFn: () => fetchMyBecomePro(seasonId),
  });

  if (isError) {
    return <ErrorState message="Could not load your Become Pro page." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="min-h-full bg-landing-hero p-4 sm:p-6">
        <PageLoading label="Loading your season" />
      </div>
    );
  }

  // The page tutorial: opens by itself on this account's first visit, and the
  // "?" button replays it. Only on the loaded page — over a spinner or an
  // error it would describe sections that aren't there — and beside the view
  // rather than in it, outside every Reveal: their rise animation is a
  // transform, which would pin the tutorial's fixed overlay and button to
  // that block instead of the viewport.
  return (
    <>
      <BecomeProView data={data} onSelectSeason={setSeasonId} />
      <PageTutorial tutorial={BECOME_PRO_TUTORIAL} />
    </>
  );
}

function BecomeProView({ data, onSelectSeason }: { data: MyBecomePro; onSelectSeason: (id: string | undefined) => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("view");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const active = data.seasons.find((season) => season.id === data.activeSeasonId) ?? null;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProspectSeason(id),
    onSuccess: async () => {
      setConfirmingDelete(false);
      onSelectSeason(undefined);
      await invalidateBecomeProQueries(queryClient);
    },
  });

  const header = (
    <Reveal>
      <div className="border border-landing-light bg-locker-surface p-4 sm:p-6">
        <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Become Pro</h1>
        <p className="mt-2 max-w-2xl text-[12.5px] text-locker-ink-muted">
          This page turns the games you actually play into a projection on the NBA rookie salary scale: your
          season line, the draft pick it points to, and the real NBA rookies your game looks most like. It is
          not fantasy basketball — there are no rosters, trades or lineups to manage — and only you can see
          this page.
        </p>

        {active && mode === "view" && (
          <>
            <p className="mt-4 font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase">
              {active.season} · {COMPETITION_LEVEL_LABELS[active.competitionLevel]} · {active.position}
              {active.teamName ? ` · ${active.teamName}` : ""}
            </p>

            {data.seasons.length > 1 && (
              <SeasonPicker seasons={data.seasons} activeId={active.id} onSelect={onSelectSeason} />
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={QUIET_BUTTON_CLASS} onClick={() => setMode("edit")}>
                Edit details
              </button>
              <button type="button" className={QUIET_BUTTON_CLASS} onClick={() => setMode("new")}>
                Add a season
              </button>
              {/* Two-click confirm, the same shape DeleteAccountControl uses:
                  this removes every game in the season. */}
              {confirmingDelete ? (
                <>
                  <button
                    type="button"
                    className={DANGER_BUTTON_CLASS}
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(active.id)}
                  >
                    {deleteMutation.isPending ? "Deleting…" : `Delete ${active.season} and its games`}
                  </button>
                  <button type="button" className={QUIET_BUTTON_CLASS} onClick={() => setConfirmingDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className={DANGER_BUTTON_CLASS} onClick={() => setConfirmingDelete(true)}>
                  Delete season
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Reveal>
  );

  // No season yet, or starting another: the setup form is the page. On a
  // first visit the how-it-works steps come first — that is the visit where
  // the page otherwise never says what it is for.
  if (!active || mode === "new") {
    return (
      <PageFrame>
        {header}
        {!active && (
          <Reveal delay={1}>
            <LockerSection title="How it works">
              <HowItWorksSteps />
            </LockerSection>
          </Reveal>
        )}
        <Reveal delay={active ? 1 : 2}>
          <LockerSection title={active ? "Add a season" : "Start your first season"}>
            <SeasonSetupForm
              takenSeasons={data.seasons.map((season) => season.season)}
              onDone={(id) => {
                setMode("view");
                onSelectSeason(id);
              }}
              onCancel={active ? () => setMode("view") : undefined}
            />
          </LockerSection>
        </Reveal>
        <Reveal delay={active ? 2 : 3}>
          <HowItWorks />
        </Reveal>
      </PageFrame>
    );
  }

  // Null only when there is no season, which returned above; typed nullable
  // for that empty page, so each section still checks rather than casts.
  const averages = data.seasonAverages;
  const gamesPlayed = averages?.gamesPlayed ?? 0;

  return (
    <PageFrame>
      {header}

      {mode === "edit" && (
        <Reveal>
          <LockerSection title="Season details">
            <SeasonSetupForm
              season={active}
              takenSeasons={data.seasons.map((season) => season.season)}
              onDone={() => setMode("view")}
              onCancel={() => setMode("view")}
            />
          </LockerSection>
        </Reveal>
      )}

      {/* The value card comes FIRST in the source so a phone shows it straight
          under the header — it is the headline, and stacking the columns would
          otherwise bury it below every logged game. From lg it is placed in
          the top-right cell, with the rest of the rail beneath it, and the
          main column spans both rows; the auto/1fr rows keep the card and the
          rail together however long the game log grows. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        <div className="lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <Reveal delay={1}>
            <ProspectValueCard
              valuation={data.valuation}
              valuationState={data.valuationState}
              competitionLevel={active.competitionLevel}
              gamesLogged={active.gamesLogged}
              minimumGamesRequired={data.minimumGamesRequired}
              valueHistory={data.valueHistory}
            />
          </Reveal>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Reveal>
            <LockerSection title="Your games">
              <SeasonEntryPanel season={active} games={data.games} />
            </LockerSection>
          </Reveal>

          {averages && gamesPlayed > 0 && (
            <Reveal delay={1}>
              <LockerSection
                title="Season line"
                action={<StatGlossaryInfo label="What TS% means" stats={["TS%"]} />}
              >
                <SeasonStatGrid averages={averages} />
                {isSmallSample(gamesPlayed) && (
                  <p className="mt-2 text-[11px] text-locker-ink-muted">
                    Only {gamesPlayed} {gamesPlayed === 1 ? "game" : "games"} — the rate figures above will move a
                    lot with each new one.
                  </p>
                )}
              </LockerSection>
            </Reveal>
          )}

          {gamesPlayed > 1 && (
            <Reveal delay={1}>
              <LockerSection title="Scoring by game">
                <PointsTrendChart data={toTrendData(data.gameLog)} />
              </LockerSection>
            </Reveal>
          )}

          {averages && data.valuation && data.valuation.comparables.length > 0 && (
            <Reveal delay={2}>
              <LockerSection title="Against NBA rookies">
                <ComparablesPanel valuation={data.valuation} averages={averages} />
              </LockerSection>
            </Reveal>
          )}
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4 lg:col-start-9 lg:row-start-2">
          {averages && gamesPlayed > 0 && (
            <Reveal delay={2}>
              <LockerSection title="Traits">
                <PlayerTraitsRadar seasonAverages={averages} />
              </LockerSection>
            </Reveal>
          )}
          <Reveal delay={2}>
            <HowItWorks />
          </Reveal>
        </div>
      </div>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

// LockerSegmentControl's radiogroup, class string for class string. That
// component is typed to season segments (regular/playoffs), so it cannot take
// a list of the user's own seasons without loosening a type Compare relies on.
function SeasonPicker({
  seasons,
  activeId,
  onSelect,
}: {
  seasons: ProspectSeason[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Season"
      className="mt-3 inline-flex flex-wrap gap-1 border border-landing-light bg-landing-hero p-1"
    >
      {seasons.map((season) => (
        <button
          key={season.id}
          type="button"
          role="radio"
          aria-checked={season.id === activeId}
          onClick={() => onSelect(season.id)}
          className={`min-h-9 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 sm:min-h-0 sm:px-2.5 ${
            season.id === activeId ? "bg-locker-leather text-white" : "text-locker-ink-muted hover:text-landing-ink"
          }`}
        >
          {season.season}
        </button>
      ))}
    </div>
  );
}

// The trend chart plots labelled points, so the game log's dates become the
// labels — date only, since the API sends a full timestamp.
function toTrendData(gameLog: GameLogEntry[]) {
  return [...gameLog]
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((entry) => ({ gameLabel: entry.gameDate.slice(0, 10), points: entry.points }));
}

// A percentage from zero attempts is 0 and meaningless — SeasonAverages types
// it as a plain number — so it is suppressed here at the edge rather than by
// widening a type every NBA page depends on.
function shootingValue(percentage: number, attemptsPerGame: number): string {
  return hasAttempts(attemptsPerGame) ? formatPercentage(percentage) : NO_VALUE;
}

function SeasonStatGrid({ averages }: { averages: SeasonAverages }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Games" value={averages.gamesPlayed} />
      <StatTile label="PPG" value={formatNumber(averages.pointsPerGame)} />
      <StatTile label="RPG" value={formatNumber(averages.reboundsPerGame)} />
      <StatTile label="APG" value={formatNumber(averages.assistsPerGame)} />
      <StatTile label="SPG" value={formatNumber(averages.stealsPerGame)} />
      <StatTile label="BPG" value={formatNumber(averages.blocksPerGame)} />
      <StatTile label="MPG" value={formatNumber(averages.minutesPerGame)} />
      <StatTile label="TOV" value={formatNumber(averages.turnoversPerGame)} />
      <StatTile label="FG%" value={shootingValue(averages.fieldGoalPercentage, averages.fieldGoalsAttemptedPerGame)} />
      <StatTile label="3P%" value={shootingValue(averages.threePointPercentage, averages.threesAttemptedPerGame)} />
      <StatTile label="FT%" value={shootingValue(averages.freeThrowPercentage, averages.freeThrowsAttemptedPerGame)} />
      <StatTile
        label="TS%"
        value={shootingValue(averages.trueShootingPercentage, averages.fieldGoalsAttemptedPerGame)}
      />
    </div>
  );
}

function ComparablesPanel({ valuation, averages }: { valuation: ProspectValuation; averages: SeasonAverages }) {
  // Plot the line the similarity score was computed on: the model compared a
  // LEVEL-ADJUSTED line against NBA rookie seasons. Overlaying the raw line
  // instead would let a Division II player's 24 points tower over a rookie's
  // 14 while the number beside the radar calls them loosely alike — the
  // picture contradicting the figure.
  const isAdjusted = valuation.levelFactor !== 1;
  const comparedLine = isAdjusted ? valuation.levelAdjustedAverages : averages;

  // The user goes FIRST so they take COMPARISON_PLAYER_COLORS[0] —
  // locker-leather, the app's subject accent — and read as the subject of the
  // comparison. "Level-adjusted" is said in words, because a translated line
  // must never pass for the logged one.
  const entries: TraitsComparisonEntry[] = [
    {
      player: { id: "you", firstName: "You", lastName: isAdjusted ? "(level-adjusted)" : "" },
      seasonAverages: comparedLine,
    },
    ...valuation.comparables.map((comparable) => ({
      player: comparable.player,
      seasonAverages: comparable.seasonAverages,
    })),
  ];

  return (
    <div>
      <ComparisonTraitsRadar entries={entries} />
      <p className="mt-3 text-[11.5px] text-locker-ink-muted">
        {isAdjusted
          ? `Your line here is translated by the ${valuation.levelFactor.toFixed(2)} level factor, which is what the similarity was measured on — the season line shows it as you logged it. `
          : ""}
        Each NBA player is shown on their rookie regular season. Similarity is a shape match — it says these
        profiles look alike, not that the players are equivalent.
      </p>
      <ul className="mt-3 space-y-1.5 border-t border-landing-light pt-3">
        {valuation.comparables.map((comparable) => (
          <li key={comparable.player.id} className="text-[12px]">
            <Link to={`/players/${comparable.player.id}`} className="text-landing-ink underline-offset-[3px] hover:underline">
              {comparable.player.firstName} {comparable.player.lastName}
            </Link>
            <span className="ml-1.5 text-locker-ink-muted tabular-nums">
              {comparable.rookieSeason} rookie season · {Math.round(comparable.similarity * 100)}% similar
            </span>
          </li>
        ))}
      </ul>

      {valuation.slotAlumni.length > 0 && (
        <div className="mt-4 border-t border-landing-light pt-3">
          <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
            Drafted at pick {valuation.projectedDraftSlot}
          </p>
          <ul className="mt-1.5 space-y-1">
            {valuation.slotAlumni.map((alumnus) => (
              <li key={alumnus.player.id} className="text-[12px]">
                <Link to={`/players/${alumnus.player.id}`} className="text-landing-ink underline-offset-[3px] hover:underline">
                  {alumnus.player.firstName} {alumnus.player.lastName}
                </Link>
                <span className="ml-1.5 text-locker-ink-muted tabular-nums">{alumnus.draftYear}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// What the page is, in the order a new user meets it — shown on a first visit
// only, where the empty page would otherwise never say what it is for. No
// figure the server decides (the games floor) appears here: it changes
// without this file knowing.
const HOW_IT_WORKS_STEPS = [
  {
    title: "Log your games",
    body: "One box score per game: the date, the opponent and your stats. No rosters, trades or lineups to manage.",
  },
  {
    title: "Your season line builds itself",
    body: "Your per-game averages are worked out from the games you log, never typed in.",
  },
  {
    title: "See what it projects to",
    body: "Once enough games are logged, a model projects the draft pick your season points to and the rookie-scale salary for that pick — and shows the real NBA rookies your game looks most like.",
  },
];

// An <ol> because the order is the point — each step feeds the next. The
// number chips repeat the list position, so they are hidden from screen
// readers; the <ol> announces "1 of 3" itself.
function HowItWorksSteps() {
  return (
    <ol className="space-y-3">
      {HOW_IT_WORKS_STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-landing-light bg-locker-surface font-mono text-[10px] text-locker-ink-muted"
          >
            {index + 1}
          </span>
          <div>
            <p className="text-[12.5px] font-medium text-landing-ink">{step.title}</p>
            <p className="mt-0.5 text-[11.5px] text-locker-ink-muted">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// A <details> rather than a modal or a separate page: the explanation matters
// enough to be one tap away, and not enough to push the season down the page.
function HowItWorks() {
  return (
    <details className="border border-landing-light bg-locker-surface p-4">
      <summary className="cursor-pointer font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
        How the valuation works
      </summary>
      <div className="mt-3 space-y-2.5 text-[11.5px] text-locker-ink-muted">
        <p>
          You log a box score per game. Your season line is worked out from those games — never typed in
          directly — the same way every NBA figure on this site is worked out from per-play records.
        </p>
        <p>
          Once you have logged ten games, a model maps your line onto a projected{" "}
          <strong className="text-landing-ink">draft pick</strong>, after translating it to Division I level for
          the competition you played against. The pick is what the model actually predicts; the dollar figure is
          the published NBA rookie salary scale&rsquo;s value for that pick.
        </p>
        <p>
          The model is trained on real NBA rookies — how production in a player&rsquo;s first season relates to
          where they were drafted — and the players you are compared with are those same rookies.
        </p>
        <p>
          It is a projection of a rookie-scale salary, not an offer, not a market price, and not a claim about
          what any team would pay. No language model is involved anywhere in the calculation.
        </p>
      </div>
    </details>
  );
}
