/**
 * Season averages for the watchlist, derived in one aggregate query rather
 * than one query per followed player. The home page loads this on every
 * visit, so the shape here is deliberately narrow: the three headline rates
 * the watchlist board shows, not the full seventeen-field line
 * StatsService.deriveSeasonAverages() builds for a player profile.
 *
 * The arithmetic is intentionally identical to that of StatsService: sum the
 * raw PlayerGameStat column, divide by the number of boxscore rows, round to
 * one decimal place. Only the place the summing happens differs — Postgres,
 * via groupBy, instead of Array.reduce in Node. pointsPerGame therefore reads
 * the same on the watchlist as it does on the player's own page.
 */

// One decimal place, matching StatsService's round() exactly. A watchlist that
// said 25.5 where the profile said 25.46 would look like a bug to a user.
const AVERAGE_DECIMAL_PLACES = 1;
const AVERAGE_ROUNDING_FACTOR = 10 ** AVERAGE_DECIMAL_PLACES;

export interface WatchlistSeasonAverages {
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
}

/**
 * One row of
 * prisma.playerGameStat.groupBy({ by: ["playerId"], _sum: {...}, _count: { _all: true } }).
 * Declared structurally rather than imported from Prisma's generated types so
 * this module — and its unit spec — needs no database and no client.
 */
export interface PlayerStatTotalsRow {
  playerId: string;
  _count: { _all: number };
  _sum: {
    points: number | null;
    rebounds: number | null;
    assists: number | null;
  };
}

// What a followed player with no boxscore rows yet gets: zeroes, not nulls and
// not a guess. gamesPlayed: 0 is the honest signal that there is nothing to
// average, and lets the frontend show "no games yet" instead of "0.0 PPG".
export const EMPTY_SEASON_AVERAGES: WatchlistSeasonAverages = {
  gamesPlayed: 0,
  pointsPerGame: 0,
  reboundsPerGame: 0,
  assistsPerGame: 0,
};

function roundToAveragePrecision(value: number): number {
  return Math.round(value * AVERAGE_ROUNDING_FACTOR) / AVERAGE_ROUNDING_FACTOR;
}

/**
 * Divides one season total by the games it was accumulated over.
 *
 * @param total - the summed column. Postgres SUM() is null over zero rows, and
 *                Prisma surfaces that as null, so null is treated as zero.
 * @param gamesPlayed - the boxscore row count for that player.
 * @returns the per-game rate to one decimal place, or 0 when no games played
 *          (dividing by zero would yield NaN, which is not valid JSON).
 */
function averagePerGame(total: number | null, gamesPlayed: number): number {
  if (gamesPlayed === 0) return 0;
  return roundToAveragePrecision((total ?? 0) / gamesPlayed);
}

/**
 * Turns one player's season totals into their per-game averages.
 *
 * @param totalsRow - a single groupBy row for that player.
 * @returns the three headline rates plus the number of games they came from.
 */
export function deriveAveragesFromTotals(totalsRow: PlayerStatTotalsRow): WatchlistSeasonAverages {
  const gamesPlayed = totalsRow._count._all;
  return {
    gamesPlayed,
    pointsPerGame: averagePerGame(totalsRow._sum.points, gamesPlayed),
    reboundsPerGame: averagePerGame(totalsRow._sum.rebounds, gamesPlayed),
    assistsPerGame: averagePerGame(totalsRow._sum.assists, gamesPlayed),
  };
}

/**
 * Indexes a whole groupBy result by playerId, so the watchlist can attach each
 * player's averages in a single pass with no further queries.
 *
 * @param totalsRows - every groupBy row for the watched players. Players with
 *                     no boxscores are simply absent from this array; callers
 *                     fall back to EMPTY_SEASON_AVERAGES for those.
 * @returns a Map from playerId to that player's averages.
 */
export function buildAveragesByPlayerId(
  totalsRows: PlayerStatTotalsRow[]
): Map<string, WatchlistSeasonAverages> {
  return new Map(totalsRows.map((totalsRow) => [totalsRow.playerId, deriveAveragesFromTotals(totalsRow)]));
}
