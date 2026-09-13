import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { fetchPlayer, fetchPlayerComparison, fetchPlayerStats } from "@/lib/nbaApi";
import { PlayerSearchCombobox } from "@/components/PlayerSearchCombobox";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { SectionLoading } from "@/components/ui/loading-overlay";
import { ErrorState } from "@/components/ErrorState";
import { Reveal } from "@/components/landing/Reveal";
import { ComparisonTraitsRadar } from "@/components/ComparisonTraitsRadar";
import { cn } from "@/lib/utils";
import { NO_VALUE, formatAge, formatHeight } from "@/lib/playerBio";
import { formatNumber, formatPercentage, formatPlusMinus, formatRatio } from "@/lib/advancedStats";
import { LockerSegmentControl } from "@/components/LockerSegmentControl";
import { SEASON_TYPES_IN_ORDER, formatSeasonType, parseUrlSegment, toUrlSegment } from "@/lib/seasonType";
import { COMPARISON_PLAYER_COLORS } from "@/lib/comparisonColors";
import type { Player, PlayerComparisonEntry, SeasonAverages, SeasonType } from "@/types/nba";

const MAX_PLAYERS = 4;
const MIN_PLAYERS_FOR_COMPARISON = 2;

// Width of the left-hand column holding the row names and the "add player"
// button. Shared by the tile header and every stat group so all of them sit
// on one column grid; clamped rather than fixed so narrow screens give the
// player columns their space back without a media query.
const LABEL_COLUMN_WIDTH = "clamp(5.5rem, 16vw, 11rem)";

const POSITION_NAMES: Record<string, string> = {
  G: "Guard",
  F: "Forward",
  C: "Center",
};

// "G" -> "Guard", "G-F" -> "Guard-Forward". The roster feed also hands out
// "N/A" for players it has no position for (see rosters.py), and anything
// else unrecognised is passed straight through rather than mangled.
function formatPosition(position: string): string {
  const parts = position.split("-");
  if (!parts.every((part) => part in POSITION_NAMES)) return position;
  return parts.map((part) => POSITION_NAMES[part]).join("-");
}

// "6.4 / 13.5 (47.5%)" — made, attempted and accuracy in one cell, so the
// shooting rows need one label each instead of three.
function formatShootingSplit(made: number, attempted: number, percentage: number): string {
  return `${made} / ${attempted} (${percentage}%)`;
}

// One comparable metric: how to display it per player, and (optionally) the
// numeric value used to highlight the leader in that row.
interface StatRow {
  label: string;
  render: (averages: SeasonAverages, player: Player) => ReactNode;
  // Returns null when this player has no figure for the row — an
  // unavailable stat must never win or lose the highlight, only sit out of
  // the comparison. See bestEntryIndexes.
  compareValue?: (averages: SeasonAverages) => number | null;
  // Turnovers and defensive rating are the rows where a lower number is the
  // better one.
  higherIsBetter?: boolean;
}

interface StatGroup {
  title: string;
  // Optional line under the heading explaining a shared cell format.
  caption?: string;
  rows: StatRow[];
}

// Grouped so each heading carries the "(per game)" qualifier and the row
// names underneath stay short.
const STAT_GROUPS: StatGroup[] = [
  {
    title: "General",
    rows: [
      // No compareValue: every other row highlights a leader, but there is no
      // better age to be, so this row stays unhighlighted.
      { label: "Age", render: (_averages, player) => formatAge(player.birthDate) },
      { label: "Height", render: (_averages, player) => formatHeight(player.heightInches) },
      {
        label: "Team",
        // Position is deliberately absent from this group: it already sits on
        // the player's tile, so a row would just repeat it.
        render: (_averages, player) =>
          player.team ? (
            <span className="inline-flex items-center justify-center gap-2">
              <TeamBadge team={player.team} size="sm" />
              {player.team.name}
            </span>
          ) : (
            "Free agent"
          ),
      },
    ],
  },
  {
    title: "Games",
    rows: [
      {
        label: "Total played",
        render: (averages) => `${averages.gamesPlayed}`,
        compareValue: (averages) => averages.gamesPlayed,
      },
      {
        label: "Minutes per game",
        render: (averages) => `${averages.minutesPerGame}`,
        compareValue: (averages) => averages.minutesPerGame,
      },
    ],
  },
  {
    title: "Points (per game)",
    caption: "made / attempted (accuracy)",
    rows: [
      {
        label: "Total",
        render: (averages) => `${averages.pointsPerGame}`,
        compareValue: (averages) => averages.pointsPerGame,
      },
      {
        label: "Field goals",
        render: (averages) =>
          formatShootingSplit(
            averages.fieldGoalsMadePerGame,
            averages.fieldGoalsAttemptedPerGame,
            averages.fieldGoalPercentage
          ),
        // Leader is whoever makes more per game, not whoever shoots the
        // better percentage — these rows sit under "Points", so they are
        // about scoring production. Accuracy shows alongside so a
        // low-volume, high-efficiency line still reads correctly.
        compareValue: (averages) => averages.fieldGoalsMadePerGame,
      },
      {
        label: "3 pointers",
        render: (averages) =>
          formatShootingSplit(
            averages.threesMadePerGame,
            averages.threesAttemptedPerGame,
            averages.threePointPercentage
          ),
        compareValue: (averages) => averages.threesMadePerGame,
      },
      {
        label: "Free throws",
        render: (averages) =>
          formatShootingSplit(
            averages.freeThrowsMadePerGame,
            averages.freeThrowsAttemptedPerGame,
            averages.freeThrowPercentage
          ),
        compareValue: (averages) => averages.freeThrowsMadePerGame,
      },
    ],
  },
  {
    title: "Rebounds & assists (per game)",
    rows: [
      {
        label: "Rebounds",
        render: (averages) => `${averages.reboundsPerGame}`,
        compareValue: (averages) => averages.reboundsPerGame,
      },
      {
        label: "Assists",
        render: (averages) => `${averages.assistsPerGame}`,
        compareValue: (averages) => averages.assistsPerGame,
      },
    ],
  },
  {
    title: "Defense & ball security (per game)",
    rows: [
      {
        label: "Steals",
        render: (averages) => `${averages.stealsPerGame}`,
        compareValue: (averages) => averages.stealsPerGame,
      },
      {
        label: "Blocks",
        render: (averages) => `${averages.blocksPerGame}`,
        compareValue: (averages) => averages.blocksPerGame,
      },
      {
        label: "Turnovers",
        render: (averages) => `${averages.turnoversPerGame}`,
        compareValue: (averages) => averages.turnoversPerGame,
        higherIsBetter: false,
      },
    ],
  },
  {
    title: "Other",
    caption:
      "Efficiency and role. Shown as — where a figure hasn't been ingested for that player yet.",
    rows: [
      {
        label: "True shooting %",
        render: (averages) => `${averages.trueShootingPercentage}%`,
        compareValue: (averages) => averages.trueShootingPercentage,
      },
      {
        label: "Effective field goal %",
        render: (averages) => `${averages.effectiveFieldGoalPercentage}%`,
        compareValue: (averages) => averages.effectiveFieldGoalPercentage,
      },
      {
        label: "Usage %",
        render: (averages) => formatPercentage(averages.usagePercentage),
        compareValue: (averages) => averages.usagePercentage,
      },
      {
        label: "Assist to turnover ratio",
        render: (averages) => formatRatio(averages.assistToTurnoverRatio),
        compareValue: (averages) => averages.assistToTurnoverRatio,
      },
      {
        label: "+/-",
        render: (averages) => formatPlusMinus(averages.plusMinusPerGame),
        compareValue: (averages) => averages.plusMinusPerGame,
      },
      {
        label: "Offensive rating",
        render: (averages) => formatNumber(averages.offensiveRating),
        compareValue: (averages) => averages.offensiveRating,
      },
      {
        // Points allowed per 100 possessions, so the lower figure is the
        // stronger defender — the second row in this table where the
        // highlight has to invert.
        label: "Defensive rating",
        render: (averages) => formatNumber(averages.defensiveRating),
        compareValue: (averages) => averages.defensiveRating,
        higherIsBetter: false,
      },
    ],
  },
];

// Plain-terms gloss for every abbreviation this page's table and radar use,
// shown once at the bottom rather than repeated next to each stat — a
// glossary a reader checks when they hit a term they don't recognise,
// not something that has to sit beside the number every time.
const GLOSSARY_TERMS: { term: string; explain: string }[] = [
  { term: "TS%", explain: "True shooting percentage — scoring efficiency that counts threes and free throws, so volume shooters and efficient scorers aren't lumped together." },
  { term: "eFG%", explain: "Effective field goal percentage — adjusts shooting percentage to weigh a three-pointer as worth more than a two." },
  { term: "Usage %", explain: "The share of their team's possessions that end in this player shooting, drawing a foul, or turning it over while they're on the floor." },
  { term: "AST:TO", explain: "Assist-to-turnover ratio — playmaking weighed against mistakes. Above 2.0 means a player creates twice as often as they cough it up." },
  { term: "+/-", explain: "Point differential while this player is on the floor — positive means their team outscored the opponent during their minutes." },
  { term: "Offensive / defensive rating", explain: "Points scored (offensive) or allowed (defensive) per 100 possessions — pace-adjusted so a fast team and a slow team can be compared fairly. Lower is better on defense." },
];

// Indexes of the entries holding the best value for this row. Empty when the
// row isn't comparable, there are fewer than two players, or every player has
// the same value (nothing to single out).
function bestEntryIndexes(entries: PlayerComparisonEntry[], row: StatRow): Set<number> {
  const compareValue = row.compareValue;
  if (!compareValue || entries.length < MIN_PLAYERS_FOR_COMPARISON) return new Set();

  const values = entries.map((entry) => compareValue(entry.seasonAverages));
  // A player missing the figure is excluded from the contest rather than
  // treated as zero, which would hand the "best" badge to whoever happens
  // to have been ingested most recently.
  const comparableValues = values.filter((value): value is number => value !== null);
  if (comparableValues.length < MIN_PLAYERS_FOR_COMPARISON) return new Set();

  const allEqual = comparableValues.every((value) => value === comparableValues[0]);
  if (allEqual) return new Set();

  const higherIsBetter = row.higherIsBetter ?? true;
  const best = higherIsBetter ? Math.max(...comparableValues) : Math.min(...comparableValues);
  return new Set(values.flatMap((value, index) => (value !== null && value === best ? [index] : [])));
}

// How full each entry's head-to-head bar should be for a comparable row —
// proportional to the row's largest value among the filled slots, so the
// leader's bar always reaches the full width and the rest read relative to
// it. null (row isn't comparable, or this slot has no figure) means "don't
// draw a bar" rather than a zero-width one, which would misreport "no data"
// as "worst in the field".
function barWidthPercentages(entries: PlayerComparisonEntry[], row: StatRow): (number | null)[] {
  const compareValue = row.compareValue;
  if (!compareValue) return entries.map(() => null);

  const values = entries.map((entry) => compareValue(entry.seasonAverages));
  const comparableValues = values.filter((value): value is number => value !== null);
  if (comparableValues.length < MIN_PLAYERS_FOR_COMPARISON) return entries.map(() => null);

  // Bar length always reads as "more of this raw number" — even for rows
  // where lower is better (turnovers), so the bar and the number always
  // agree. Which value is actually the *better* one is still called out by
  // bestEntryIndexes' text highlight; the bar isn't trying to also encode that.
  const max = Math.max(...comparableValues);
  return values.map((value) => {
    if (value === null || max <= 0) return null;
    return Math.max(4, Math.round((value / max) * 100));
  });
}

function useSelectedPlayerIds(): [string[], (playerIds: string[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const playerIds = useMemo(() => {
    const raw = searchParams.get("ids");
    return raw ? [...new Set(raw.split(",").filter(Boolean))] : [];
  }, [searchParams]);

  function setPlayerIds(nextPlayerIds: string[]) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPlayerIds.length === 0) {
      nextParams.delete("ids");
    } else {
      nextParams.set("ids", nextPlayerIds.join(","));
    }
    setSearchParams(nextParams, { replace: true });
  }

  return [playerIds, setPlayerIds];
}

// Same ?segment= URL parameter the player profile uses, so following the
// "Compare" link from a postseason view lands on a postseason comparison.
function useSelectedSeasonType(): [SeasonType, (seasonType: SeasonType) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const seasonType = parseUrlSegment(searchParams.get("segment"));

  function selectSeasonType(nextSeasonType: SeasonType) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("segment", toUrlSegment(nextSeasonType));
    setSearchParams(nextParams, { replace: true });
  }

  return [seasonType, selectSeasonType];
}

// The label column plus one equal column per slot, so the header tiles, the
// group headings and every stat row share the same column edges.
function gridStyle(slotCount: number) {
  return {
    gridTemplateColumns: `${LABEL_COLUMN_WIDTH} repeat(${slotCount}, minmax(0, 1fr))`,
  };
}

// The page title and every group heading sit centred over the player columns
// only — the label column is excluded, so a heading lands on the gap between
// two tiles rather than off to the left of centre.
const PLAYER_COLUMNS_SPAN = { gridColumn: "2 / -1" };

// Was a solid dark-theme circle (bg-surface-raised) left over from before
// this page moved to the locker palette — it read as a UI glitch sitting on
// the light background rather than an inviting "pick someone" prompt. A
// dashed outline in the same leather accent as "Add another player" reads
// as part of the empty-slot's own dashed border instead of a stray dark blob.
function PlaceholderHeadshot() {
  return (
    <div className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-locker-leather/40 text-locker-leather/60">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-9" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
      </svg>
    </div>
  );
}

function PlayerTile({ player, onRemove }: { player: Player; onRemove: () => void }) {
  return (
    <div className="relative flex flex-col items-center gap-2 border border-landing-light bg-locker-surface px-4 py-5 text-center">
      <button
        type="button"
        aria-label={`Remove ${player.firstName} ${player.lastName} from the comparison`}
        className="absolute top-2 left-2 px-1.5 text-base leading-none text-locker-ink-muted transition-colors hover:text-landing-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
        onClick={onRemove}
      >
        ✕
      </button>
      <PlayerHeadshot player={player} size="lg" />
      <div className="font-display text-base tracking-[0.01em] text-landing-ink uppercase">
        {player.firstName} {player.lastName}
      </div>
      {/* Position lives here and nowhere else; the team is the General
          group's job, so the two aren't shown twice. */}
      <div className="font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase">
        {formatPosition(player.position)}
      </div>
    </div>
  );
}

// An unfilled column: the comparison always shows at least two slots, so the
// page reads as "two players go here" before anything is picked rather than
// as an empty page with a single button.
function EmptySlotTile({
  slotNumber,
  onSelect,
  onCancel,
  excludedPlayerIds,
}: {
  slotNumber: number;
  onSelect: (player: Player) => void;
  // Only passed for slots the user opened with "Add another player" — the two
  // the comparison always shows can't be cancelled away.
  onCancel?: () => void;
  excludedPlayerIds: string[];
}) {
  return (
    <div className="relative flex flex-col items-center gap-3 border border-dashed border-landing-light bg-locker-surface px-4 py-5">
      {onCancel && (
        <button
          type="button"
          aria-label={`Cancel adding player ${slotNumber}`}
          className="absolute top-2 left-2 px-1.5 text-base leading-none text-locker-ink-muted transition-colors hover:text-landing-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
          onClick={onCancel}
        >
          ✕
        </button>
      )}
      <PlaceholderHeadshot />
      <PlayerSearchCombobox
        onSelect={onSelect}
        excludedPlayerIds={excludedPlayerIds}
        placeholder="Select player"
        label={`Select player ${slotNumber}`}
        variant="locker"
        suggestWhenEmpty
      />
    </div>
  );
}

function LoadingSlotTile() {
  return (
    <div className="flex h-[186px] items-center justify-center border border-landing-light bg-locker-surface">
      <BasketballSpinner label="Loading player" />
    </div>
  );
}

export function ComparePage() {
  const [playerIds, setPlayerIds] = useSelectedPlayerIds();
  const [seasonType, selectSeasonType] = useSelectedSeasonType();
  // Extra empty columns the user asked for with "Add another player", beyond
  // the two the comparison always shows. Consumed as they get filled.
  const [extraSlots, setExtraSlots] = useState(0);

  // seasonType is in the query key so each segment caches separately —
  // comparing two players inside a playoffs view has to compare their
  // playoff lines, or the comparison answers a different question than the
  // one on screen.
  const comparisonQuery = useQuery({
    queryKey: ["playerComparison", playerIds, seasonType],
    queryFn: () => fetchPlayerComparison(playerIds, seasonType),
    enabled: playerIds.length >= MIN_PLAYERS_FOR_COMPARISON,
  });

  // The compare endpoint needs two players; a lone selected player (just
  // added, or left after a removal) is resolved on its own so the tile still
  // renders while the user picks an opponent.
  const lonePlayerId = playerIds.length === 1 ? playerIds[0] : undefined;
  const lonePlayerQuery = useQuery({
    queryKey: ["playerComparison", "lone", lonePlayerId, seasonType],
    queryFn: async (): Promise<PlayerComparisonEntry> => {
      const [player, stats] = await Promise.all([
        fetchPlayer(lonePlayerId!),
        fetchPlayerStats(lonePlayerId!, seasonType),
      ]);
      return { player, seasonAverages: stats.seasonAverages };
    },
    enabled: !!lonePlayerId,
  });

  const isComparing = playerIds.length >= MIN_PLAYERS_FOR_COMPARISON;
  const entries: PlayerComparisonEntry[] = isComparing
    ? (comparisonQuery.data?.players ?? [])
    : lonePlayerQuery.data
      ? [lonePlayerQuery.data]
      : [];

  const activeQuery = isComparing ? comparisonQuery : lonePlayerQuery;
  // A selection that hasn't resolved yet still owns its column, so the layout
  // doesn't jump once the data lands.
  const claimedColumns = Math.max(entries.length, playerIds.length);
  // The columns the page owes you regardless of what you've asked for: your
  // selections, or the two empty slots a comparison always shows. Anything
  // past this came from "Add another player" and can be cancelled again.
  const requiredColumns = Math.max(claimedColumns, MIN_PLAYERS_FOR_COMPARISON);
  const slotCount = Math.min(requiredColumns + extraSlots, MAX_PLAYERS);
  const slots = Array.from({ length: slotCount }, (_, index) => entries[index] ?? null);
  const canAddSlot = slotCount < MAX_PLAYERS;
  const columns = gridStyle(slotCount);

  function addPlayer(player: Player) {
    if (playerIds.includes(player.id) || playerIds.length >= MAX_PLAYERS) return;
    setPlayerIds([...playerIds, player.id]);
    setExtraSlots((slots) => Math.max(0, slots - 1));
  }

  function removePlayer(playerId: string) {
    setPlayerIds(playerIds.filter((id) => id !== playerId));
  }

  const showRadar = entries.length >= MIN_PLAYERS_FOR_COMPARISON;

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        {/* Left-aligned like every other page's header band (Teams,
            Predictions) rather than centred over the player columns. */}
        <Reveal>
          <div className="mb-6 border border-landing-light bg-locker-surface p-6">
            <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">
              Player comparison
            </h1>
            <p className="mt-2 max-w-2xl text-[12.5px] text-locker-ink-muted">
              Compare up to {MAX_PLAYERS} players side by side on their {formatSeasonType(seasonType).toLowerCase()}{" "}
              averages.
            </p>
            <div className="mt-4">
              <LockerSegmentControl value={seasonType} onChange={selectSeasonType} options={SEASON_TYPES_IN_ORDER} />
            </div>
          </div>
        </Reveal>

        {/* Main comparison column plus the trait radar sidebar — the sidebar
            only earns its place once there is something to plot (two or more
            players), otherwise the two empty-slot tiles would sit next to an
            empty panel. Stacks under the main column on narrow screens. */}
        <div className={showRadar ? "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" : undefined}>
          <div>
            {/* z-20 on the Reveal itself, not something inside it: Reveal's
                rise animation applies a CSS transform to its own wrapper
                element, and a transform creates a new stacking context —
                z-index set on a descendant only settles ordering against
                other descendants of that SAME transformed wrapper, never
                against a sibling Reveal's contents. The empty slots'
                player-search dropdown needs to paint above the stat-group
                sections below (each in their own Reveal, later in DOM
                order), so the stacking context that actually matters here
                — this Reveal wrapper — is the one that needs the z-index. */}
            <Reveal className="relative z-20">
              <div className="grid items-center gap-x-3" style={columns}>
                <div className="pr-3">
                  {canAddSlot && (
                    <button
                      type="button"
                      className="flex w-full flex-col items-center gap-2 px-2 py-4 text-center transition-colors hover:bg-locker-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
                      onClick={() => setExtraSlots((slots) => slots + 1)}
                    >
                      {/* An SVG plus rather than a text "+": a glyph is placed off the
                          font's baseline, so it centres low inside the circle. */}
                      <span className="flex size-9 items-center justify-center rounded-full border border-locker-leather text-locker-leather">
                        <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.1em] text-locker-leather uppercase">
                        Add another player
                      </span>
                    </button>
                  )}
                </div>

                {slots.map((entry, index) =>
                  entry ? (
                    <PlayerTile
                      key={entry.player.id}
                      player={entry.player}
                      onRemove={() => removePlayer(entry.player.id)}
                    />
                  ) : index < playerIds.length && activeQuery.isPending ? (
                    <LoadingSlotTile key={`loading-${index}`} />
                  ) : (
                    <EmptySlotTile
                      key={`empty-${index}`}
                      slotNumber={index + 1}
                      onSelect={addPlayer}
                      onCancel={
                        index >= requiredColumns
                          ? () => setExtraSlots((slots) => Math.max(0, slots - 1))
                          : undefined
                      }
                      excludedPlayerIds={playerIds}
                    />
                  )
                )}
              </div>
            </Reveal>

            {activeQuery.isError && (
              <div className="mt-6">
                <ErrorState message="Could not load the comparison." onRetry={() => activeQuery.refetch()} />
              </div>
            )}

            {showRadar && (
              <Reveal>
                <SectionLoading loading={activeQuery.isFetching} label="Loading comparison" className="mt-6">
                  <div>
                    {STAT_GROUPS.map((group) => (
                      <section
                        key={group.title}
                        className="mt-6 grid items-center gap-x-3 gap-y-1.5 border border-landing-light bg-locker-surface p-4 first:mt-0"
                        style={columns}
                      >
                        <div style={PLAYER_COLUMNS_SPAN} className="mb-2 text-center">
                          <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
                            {group.title}
                          </h2>
                          {group.caption && (
                            <p className="mt-1 text-[11px] text-locker-ink-muted">{group.caption}</p>
                          )}
                        </div>

                        {group.rows.map((row) => {
                          const bestIndexes = bestEntryIndexes(entries, row);
                          const barWidths = barWidthPercentages(entries, row);
                          return (
                            <div key={row.label} className="contents">
                              <div className="pr-3 text-left font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase">
                                {row.label}
                              </div>
                              {slots.map((entry, index) => {
                                const barWidth = index < barWidths.length ? barWidths[index] : null;
                                return entry ? (
                                  <div key={entry.player.id} className="relative bg-landing-hero px-3 py-2 text-center">
                                    {barWidth !== null && (
                                      <span
                                        aria-hidden
                                        className="absolute inset-y-1 left-0 opacity-35"
                                        style={{ width: `${barWidth}%`, backgroundColor: COMPARISON_PLAYER_COLORS[index] }}
                                      />
                                    )}
                                    <span
                                      className={cn(
                                        "relative inline-block px-2.5 py-0.5 text-[13px] text-landing-ink tabular-nums",
                                        bestIndexes.has(index) &&
                                          "bg-locker-leather/15 font-semibold text-locker-leather"
                                      )}
                                    >
                                      {row.render(entry.seasonAverages, entry.player)}
                                    </span>
                                  </div>
                                ) : (
                                  // An unfilled slot still gets a real cell, so its column
                                  // reads as "waiting for a player" rather than as a hole
                                  // in the table.
                                  <div
                                    key={`empty-${index}`}
                                    className="bg-landing-hero px-3 py-2 text-center text-[13px] text-locker-ink-muted"
                                  >
                                    {NO_VALUE}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                </SectionLoading>
              </Reveal>
            )}
          </div>

          {showRadar && (
            <Reveal>
              <div className="border border-landing-light bg-locker-surface p-4 xl:sticky xl:top-6">
                <h2 className="mb-3 text-center font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
                  Trait radar
                </h2>
                <ComparisonTraitsRadar entries={entries} />
              </div>
            </Reveal>
          )}
        </div>

        {entries.length > 0 && (
          <Reveal>
            <div className="mt-6 border border-landing-light bg-locker-surface p-6">
              <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">Glossary</h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {GLOSSARY_TERMS.map(({ term, explain }) => (
                  <div key={term}>
                    <dt className="font-mono text-[10.5px] tracking-[0.08em] text-locker-leather uppercase">{term}</dt>
                    <dd className="mt-0.5 text-[12px] leading-snug text-locker-ink-muted">{explain}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
