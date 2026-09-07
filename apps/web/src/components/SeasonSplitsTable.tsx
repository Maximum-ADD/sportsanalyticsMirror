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
}

const STAT_ROWS: StatRow[] = [
  { label: "PPG", field: "pointsPerGame" },
  { label: "RPG", field: "reboundsPerGame" },
  { label: "APG", field: "assistsPerGame" },
  { label: "MPG", field: "minutesPerGame" },
  { label: "FG%", field: "fieldGoalPercentage", isRate: true, suffix: "%" },
  { label: "3P%", field: "threePointPercentage", isRate: true, suffix: "%" },
  { label: "FT%", field: "freeThrowPercentage", isRate: true, suffix: "%" },
];

// A delta smaller than this rounds to "no real change" and is shown as a
// dash — a 0.04 PPG difference rendered as "+0.0" reads as a measured
// finding when it's really just rounding noise.
const NEGLIGIBLE_DELTA = 0.05;

function formatDelta(delta: number, suffix: string): string {
  if (Math.abs(delta) < NEGLIGIBLE_DELTA) return "—";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toFixed(1)}${suffix}`;
}

// Colour reinforces the direction but never carries it alone — the +/−
// sign in formatDelta is what actually communicates it, so the table still
// reads correctly without colour vision.
function deltaClassName(delta: number): string {
  if (Math.abs(delta) < NEGLIGIBLE_DELTA) return "text-text-muted";
  return delta > 0 ? "text-emerald-400" : "text-red-400";
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
      <p className="text-sm text-text-muted">
        {playerName} has no postseason games in this season, so there's nothing to compare against their regular
        season yet.
      </p>
    );
  }

  const baseline = splits[BASELINE_SEASON_TYPE];
  const hasBaseline = baseline.gamesPlayed > 0;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stat</TableHead>
            {playedSegments.map((seasonType) => (
              <TableHead key={seasonType}>
                <div>{formatSeasonTypeShort(seasonType)}</div>
                {/* Games played sits in the header rather than a row of its
                    own so every number underneath is read next to the sample
                    size it came from. */}
                <div className="text-xs font-normal text-text-muted">
                  {splits[seasonType].gamesPlayed} {splits[seasonType].gamesPlayed === 1 ? "game" : "games"}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {STAT_ROWS.map((row) => (
            <TableRow key={row.field}>
              <TableCell className="font-medium text-text-secondary">{row.label}</TableCell>
              {playedSegments.map((seasonType) => {
                const value = splits[seasonType][row.field];
                const delta = value - baseline[row.field];
                const isBaselineColumn = seasonType === BASELINE_SEASON_TYPE;
                const dimForSmallSample = row.isRate && isSmallSample(splits[seasonType].gamesPlayed);

                return (
                  <TableCell key={seasonType}>
                    <span
                      className={dimForSmallSample ? "text-text-muted" : "text-text-primary"}
                      title={
                        dimForSmallSample
                          ? `Only ${splits[seasonType].gamesPlayed} games — this rate is easily swung by a handful of attempts.`
                          : undefined
                      }
                    >
                      {value.toFixed(1)}
                      {row.suffix ?? ""}
                    </span>
                    {!isBaselineColumn && hasBaseline && (
                      <span className={`ml-2 text-xs ${deltaClassName(delta)}`}>
                        {formatDelta(delta, row.suffix ?? "")}
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
