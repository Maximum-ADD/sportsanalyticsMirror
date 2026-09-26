// Everything a correction (or the admin play-by-play view) needs to know
// about one game, loaded in one place so preview, save, undo and the
// play-by-play page all see the game the same way.
import type { GameEvent, Prisma } from "@prisma/client";
import { COUNTING_STAT_FIELDS, type PlayerName } from "./derive-player-game-stats.js";
import type { StoredStatRow } from "./plan-stat-recompute.js";

export interface SnapshotGame {
  id: string;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface SnapshotPlayer {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
}

export interface GameSnapshot {
  game: SnapshotGame;
  events: GameEvent[]; // every event, ordered by sequence
  statRows: (StoredStatRow & { teamId: string | null })[];
  // The players with a stat row for this game: the game's roster.
  rosterPlayersById: Map<string, SnapshotPlayer>;
}

const STAT_ROW_SELECT = {
  playerId: true,
  teamId: true,
  ...Object.fromEntries(COUNTING_STAT_FIELDS.map((field) => [field, true])),
} as Prisma.PlayerGameStatSelect;

/**
 * Loads one game's snapshot, or null when the game doesn't exist. `db` may
 * be a transaction, so a correction reads the game under its own lock.
 */
export async function loadGameSnapshot(db: Prisma.TransactionClient, gameId: string): Promise<GameSnapshot | null> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { id: true, season: true, homeTeamId: true, awayTeamId: true },
  });
  if (game === null) return null;

  const [events, statRows] = await Promise.all([
    db.gameEvent.findMany({ where: { gameId }, orderBy: { sequence: "asc" } }),
    db.playerGameStat.findMany({ where: { gameId }, select: STAT_ROW_SELECT }) as unknown as Promise<
      GameSnapshot["statRows"]
    >,
  ]);
  const players = await db.player.findMany({
    where: { id: { in: statRows.map((row) => row.playerId) } },
    select: { id: true, firstName: true, lastName: true, teamId: true },
  });
  return { game, events, statRows, rosterPlayersById: new Map(players.map((player) => [player.id, player])) };
}

/** Roster playerId -> first and last name, as the derivation reads them. */
export function buildNamesByPlayerId(snapshot: GameSnapshot): Map<string, PlayerName> {
  return new Map(
    [...snapshot.rosterPlayersById.values()].map((player) => [
      player.id,
      { firstName: player.firstName, lastName: player.lastName },
    ]),
  );
}

/**
 * Roster playerId -> the team they played for in this game, or null when
 * nothing says. Sources, most reliable first: the stat row's own team; the
 * team on the player's events (ignoring `excludedSequence`, the event being
 * corrected, whose team may be the very thing that's wrong); and the
 * player's current team, but only when it's one of this game's two teams —
 * a current team is post-trade, so anything else can't be trusted here.
 */
export function resolveGameTeamByPlayerId(
  snapshot: GameSnapshot,
  excludedSequence: number | null = null,
): Map<string, string | null> {
  const eventTeamByPlayerId = new Map<string, string>();
  for (const event of snapshot.events) {
    if (event.sequence === excludedSequence || event.playerId === null || event.teamId === null) continue;
    if (!eventTeamByPlayerId.has(event.playerId)) eventTeamByPlayerId.set(event.playerId, event.teamId);
  }

  const gameTeamIds = [snapshot.game.homeTeamId, snapshot.game.awayTeamId];
  const teamByPlayerId = new Map<string, string | null>();
  for (const row of snapshot.statRows) {
    const currentTeamId = snapshot.rosterPlayersById.get(row.playerId)?.teamId ?? null;
    const trustedCurrentTeamId = currentTeamId !== null && gameTeamIds.includes(currentTeamId) ? currentTeamId : null;
    teamByPlayerId.set(row.playerId, row.teamId ?? eventTeamByPlayerId.get(row.playerId) ?? trustedCurrentTeamId);
  }
  return teamByPlayerId;
}
