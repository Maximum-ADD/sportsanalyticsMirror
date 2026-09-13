import { NO_VALUE } from "@/lib/playerBio";
import { SEASON_TYPES_IN_ORDER, formatSeasonTypeShort, isSmallSample } from "@/lib/seasonType";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlayerSeasonSplits, SeasonAverages, SeasonType } from "@/types/nba";

// The baseline every postseason segment is compared against — "how did this
// player change once the postseason started" only means anything relative to
// their regular season.
const BASELINE_SEASON_TYPE: SeasonType = "REGULAR";

interface StatRow {
  label: string;
  field: keyof SeasonAverages;
  // Rate stats are the ones a 2-game sample distorts most, so they get the
  // small-sample de-emphasis while counting stats don't.
  isRate?: boolean;
  suffix?: string;
  // Decimal places for the value itself. Defaults to 1; assist-to-turnover
  // uses 2 because it lives in a narrow range where one decimal hides real
  // differences.
  decimals?: number;
  // Renders a leading "+" on positive values. Only plus/minus needs it —
  // a bare "3.2" there could be read as a count rather than a margin.
  showSign?: boolean;
  // Defensive rating is the one row where a fall is an improvement, so the
  // delta colouring has to invert. Without this a defence getting better in
  // the playoffs would be coloured as a regression.
  lowerIsBetter?: boolean;
}

// Ordered production first, then shooting, then efficiency and impact —
// the same progression the profile page reads top to bottom, so someone
// moving between the two isn't hunting for a row in a different place.
const STAT_ROWS: StatRow[] = [
  { label: "PPG", field: "pointsPerGame" },
  { label: "RPG", field: "reboundsPerGame" },
  { label: "APG", field: "assistsPerGame" },
  { label: "MPG", field: "minutesPerGame" },
  { label: "FG%", field: "fieldGoalPercentage", isRate: true, suffix: "%" },
  { label: "3P%", field: "threePointPercentage", isRate: true, suffix: "%" },
  { label: "FT%", field: "freeThrowPercentage", isRate: true, suffix: "%" },
  // Efficiency measures sit directly under the raw percentages they
  // summarise: a Finals 3P% collapse is best read next to what it did to
  // true shooting overall.
  { label: "TS%", field: "trueShootingPercentage", isRate: true, suffix: "%" },
  { label: "eFG%", field: "effectiveFieldGoalPercentage", isRate: true, suffix: "%" },
  // Then role and impact, which is where the postseason shift usually
  // shows up most: usage climbs for stars as rotations shorten.
  { label: "USG%", field: "usagePercentage", isRate: true, suffix: "%" },
  { label: "AST:TO", field: "assistToTurnoverRatio", isRate: true, decimals: 2 },
  { label: "+/-", field: "plusMinusPerGame", showSign: true },
  { label: "ORTG", field: "offensiveRating", isRate: true },
  { label: "DRTG", field: "defensiveRating", isRate: true, lowerIsBetter: true },
];

// A delta smaller than this rounds to "no real change" and is shown as a
// dash — a 0.04 PPG difference rendered as "+0.0" reads as a measured
// finding when it's really just rounding noise.
const NEGLIGIBLE_DELTA = 0.05;

function formatDelta(delta: number, row: StatRow): string {
  if (Math.abs(delta) < NEGLIGIBLE_DELTA) return "—";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toFixed(row.decimals ?? 1)}${row.suffix ?? ""}`;
}

// Colour reinforces the direction but never carries it alone — the +/−
// sign in formatDelta is what actually communicates it, so the table still
// reads correctly without colour vision.
//
// `lowerIsBetter` inverts the palette without touching the sign: a
// defensive rating that drops still reads "−4.0", but in the good colour,
// because conceding fewer points per 100 possessions is an improvement.
function deltaClassName(delta: number, row: StatRow): string {
  if (Math.abs(delta) < NEGLIGIBLE_DELTA) return "text-locker-ink-muted";
  const isImprovement = row.lowerIsBetter ? delta < 0 : delta > 0;
  return isImprovement ? "text-locker-good" : "text-locker-bad";
}

// A figure the API had no basis to report — rendered as "—" with no delta,
// never as a zero. See SeasonAverages in types/nba.ts.
function formatValue(value: number | null, row: StatRow): string {
  if (value === null) return NO_VALUE;
  const formatted = value.toFixed(row.decimals ?? 1);
  const signed = row.showSign && value > 0 ? `+${formatted}` : formatted;
  return `${signed}${row.suffix ?? ""}`;
}

interface SeasonSplitsTableProps {
  splits: PlayerSeasonSplits;
  playerName: string;
}

/**
 * Regular season vs. each postseason segment the player actually appeared
 * in, with the change from their regular-season line alongside each figure.
 *
 * Segments with no games are dropped rather than shown as zeros: a column of
 * 0.0s reads as "played badly", not "wasn't there". If the player didn't
 * play in any postseason segment, the whole table is replaced by a note
 * saying so.
 */
export function SeasonSplitsTable({ splits, playerName }: SeasonSplitsTableProps) {
  const playedSegments = SEASON_TYPES_IN_ORDER.filter((seasonType) => splits[seasonType].gamesPlayed > 0);
  const postseasonSegments = playedSegments.filter((seasonType) => seasonType !== BASELINE_SEASON_TYPE);

  if (postseasonSegments.length === 0) {
    return (
      <p className="text-[12.5px] text-locker-ink-muted">
        {playerName} has no postseason games in this season, so there's nothing to compare against their regular
        season yet.
      </p>
    );
  }

  const baseline = splits[BASELINE_SEASON_TYPE];
  const hasBaseline = baseline.gamesPlayed > 0;

  return (
    <div className="overflow-x-auto">
      {/* The table primitives carry the dark app shell's colours, so each
          one takes a light override here — the same call-site pattern the
          model accuracy ledger uses on the home page. */}
      <Table>
        <TableHeader className="bg-landing-hero text-locker-ink-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-mono text-[9.5px] tracking-[0.14em] uppercase">Stat</TableHead>
            {playedSegments.map((seasonType) => (
              <TableHead key={seasonType} className="font-mono text-[9.5px] tracking-[0.14em] uppercase">
                <div>{formatSeasonTypeShort(seasonType)}</div>
                {/* Games played sits in the header rather than a row of its
                    own so every number underneath is read next to the sample
                    size it came from. */}
                <div className="font-mono text-[9px] tracking-[0.1em] font-normal normal-case">
                  {splits[seasonType].gamesPlayed} {splits[seasonType].gamesPlayed === 1 ? "game" : "games"}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-landing-light">
          {STAT_ROWS.map((row) => (
            <TableRow key={row.field} className="hover:bg-landing-hero/60">
              <TableCell className="font-mono text-[10px] tracking-[0.08em] uppercase text-locker-ink-muted">
                {row.label}
              </TableCell>
              {playedSegments.map((seasonType) => {
                const value = splits[seasonType][row.field];
                const baselineValue = baseline[row.field];
                const isBaselineColumn = seasonType === BASELINE_SEASON_TYPE;
                const dimForSmallSample = row.isRate && isSmallSample(splits[seasonType].gamesPlayed);
                // A delta needs both ends to exist. Comparing against a
                // missing baseline would silently treat "not recorded" as
                // zero and invent a change that never happened.
                const canShowDelta =
                  !isBaselineColumn && hasBaseline && value !== null && baselineValue !== null;

                return (
                  <TableCell key={seasonType}>
                    <span
                      className={`tabular-nums ${dimForSmallSample ? "text-locker-ink-muted" : "text-landing-ink"}`}
                      title={
                        dimForSmallSample
                          ? `Only ${splits[seasonType].gamesPlayed} games — this rate is easily swung by a handful of attempts.`
                          : undefined
                      }
                    >
                      {formatValue(value, row)}
                    </span>
                    {canShowDelta && (
                      <span className={`ml-2 font-mono text-[10.5px] tabular-nums ${deltaClassName(value - baselineValue, row)}`}>
                        {formatDelta(value - baselineValue, row)}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
