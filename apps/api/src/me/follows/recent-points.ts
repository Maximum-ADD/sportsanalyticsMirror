/**
 * The "last N games" sparkline behind each watchlist row: one player's most
 * recent scoring, taken from the same PlayerGameStat boxscores the averages
 * come from. Nothing here is modelled or projected — every number is a points
 * column from a game that was actually played.
 *
 * Why the slicing happens in memory: Postgres can limit rows *per player* with
 * a ROW_NUMBER() window function, but Prisma cannot express that on a
 * top-level findMany, and the alternative — one findMany per followed player —
 * is exactly the N+1 the watchlist is built to avoid. So the service issues a
 * single ordered query for every watched player at once and this function
 * takes the first N of each. The row count is bounded by the page size times a
 * season's games, and each row is four small columns.
 */

export interface PlayerGamePointsRow {
  playerId: string;
  gameId: string;
  points: number;
  game: { gameDate: Date };
}

export interface RecentGamePoints {
  gameId: string;
  gameDate: Date;
  points: number;
}

function toRecentGamePoints(statRow: PlayerGamePointsRow): RecentGamePoints {
  return { gameId: statRow.gameId, gameDate: statRow.game.gameDate, points: statRow.points };
}

/**
 * Groups boxscore rows by player and keeps each player's most recent games.
 *
 * @param statRows - boxscore rows for every watched player, ALREADY ordered
 *                   newest game first. The order is the caller's contract:
 *                   this function slices, it does not sort, so passing an
 *                   unordered array yields an arbitrary N rather than the
 *                   latest N.
 * @param recentGamesCount - how many games to keep per player. A player with
 *                           fewer games keeps all of them; a player with none
 *                           is absent from the returned map.
 * @returns a Map from playerId to that player's most recent games, newest
 *          first, each carrying the game it came from so the frontend can link
 *          the point back to a boxscore.
 */
export function takeRecentPointsByPlayerId(
  statRows: PlayerGamePointsRow[],
  recentGamesCount: number
): Map<string, RecentGamePoints[]> {
  const recentPointsByPlayerId = new Map<string, RecentGamePoints[]>();

  for (const statRow of statRows) {
    const collectedSoFar = recentPointsByPlayerId.get(statRow.playerId) ?? [];
    if (collectedSoFar.length >= recentGamesCount) continue;
    collectedSoFar.push(toRecentGamePoints(statRow));
    recentPointsByPlayerId.set(statRow.playerId, collectedSoFar);
  }

  return recentPointsByPlayerId;
}
