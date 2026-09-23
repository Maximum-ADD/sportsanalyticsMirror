// Decides which of a game's PlayerGameStat rows are re-derived from its
// events, and what each one's counting stats become. Pure, so the same plan
// can back a correction preview (shown, never written) and the correction
// itself (written) without the two ever disagreeing.
import {
  COUNTING_STAT_FIELDS,
  deriveGameEventStats,
  type CountingStatField,
  type CountingStats,
  type DerivableGameEvent,
  type PlayerName,
} from "./derive-player-game-stats.js";

// A stored PlayerGameStat row's counting stats. The O/D rebound split is
// nullable in the schema (rows ingested before it existed), the rest aren't.
export type StoredCountingStats = Record<CountingStatField, number | null>;

export interface StoredStatRow extends StoredCountingStats {
  playerId: string;
}

/** One recomputed player: stored stats, re-derived stats, and what differs. */
export interface PlayerStatRecompute {
  playerId: string;
  before: StoredCountingStats;
  after: CountingStats;
  changedFields: CountingStatField[];
}

/**
 * Re-derives the counting stats of every player who is recomputed for this
 * game, from `events` as they stand (or would stand after a correction).
 *
 * Recomputed: every player with a stat row who acts in at least one event,
 * plus every player in `retainedTeamByPlayerId` who has a stat row. A player
 * outside both keeps the stats they have, because there is nothing to
 * recompute them from: games ingested before play-by-play was translated
 * hold only period markers, and recomputing everyone there would write 0
 * over the whole box score (PR #181).
 *
 * `retainedTeamByPlayerId` is how a correction covers the player it moves a
 * play AWAY from. Recomputing only players who still act would skip a
 * player whose only play was moved, leaving them its points while the new
 * player got them too. Retained players also stay resolvable as credit
 * targets (see buildGameRoster), so moving their play doesn't also strip
 * credits they earned on other plays. Replay passes none.
 */
export function planStatRecompute(
  events: DerivableGameEvent[],
  statRows: StoredStatRow[],
  namesByPlayerId: Map<string, PlayerName>,
  retainedTeamByPlayerId: Map<string, string | null> = new Map(),
): PlayerStatRecompute[] {
  const derivedByPlayerId = deriveGameEventStats(events, namesByPlayerId, retainedTeamByPlayerId);
  const actingPlayerIds = new Set(events.map((event) => event.playerId).filter((playerId) => playerId !== null));
  const isRecomputed = (playerId: string) => actingPlayerIds.has(playerId) || retainedTeamByPlayerId.has(playerId);

  return statRows
    .filter((row) => isRecomputed(row.playerId))
    .map((row) => {
      const after = derivedByPlayerId.get(row.playerId) ?? emptyCountingStats();
      const before = pickCountingStats(row);
      const changedFields = COUNTING_STAT_FIELDS.filter((field) => before[field] !== after[field]);
      return { playerId: row.playerId, before, after, changedFields };
    });
}

function emptyCountingStats(): CountingStats {
  const stats = {} as CountingStats;
  for (const field of COUNTING_STAT_FIELDS) stats[field] = 0;
  return stats;
}

function pickCountingStats(row: StoredStatRow): StoredCountingStats {
  const stats = {} as StoredCountingStats;
  for (const field of COUNTING_STAT_FIELDS) stats[field] = row[field];
  return stats;
}
