// Matches ESPN's teams and players to this app's own rows. ESPN has its own
// ids for both, with no NBA ids to join on, so matching goes by name.

export interface MatchableTeam {
  id: string;
  /** The nickname, e.g. "Clippers" or "Trail Blazers". */
  name: string;
}

export interface MatchablePlayer {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
}

/** Normalised player name to every player with that name — usually one. */
export type PlayerNameIndex = Map<string, MatchablePlayer[]>;

// Generational suffixes ESPN and the NBA don't always agree on: ESPN writes
// "Jimmy Butler III" where the roster may carry plain "Jimmy Butler".
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Reduces a name to a form both sources agree on: accents removed ("Jokić"
 * → "jokic"), lower case, hyphens as spaces, punctuation and generational
 * suffixes dropped.
 */
export function normalizePersonName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/**
 * Finds the team ESPN means by its display name, anchoring on the nickname
 * the way apps/ingestion/fetch_market_odds.py does: ESPN writes "LA Clippers"
 * where this app's city is "Los Angeles", but no two teams share a nickname.
 *
 * @returns the team, or null when no nickname matches.
 */
export function findTeamByEspnName<T extends MatchableTeam>(espnTeamName: string, teams: T[]): T | null {
  const espnName = espnTeamName.trim().toLowerCase();
  return (
    teams.find((team) => {
      const nickname = team.name.trim().toLowerCase();
      return espnName === nickname || espnName.endsWith(` ${nickname}`);
    }) ?? null
  );
}

/** Indexes players by their normalised full name. */
export function buildPlayerNameIndex(players: MatchablePlayer[]): PlayerNameIndex {
  const index: PlayerNameIndex = new Map();
  for (const player of players) {
    const key = normalizePersonName(`${player.firstName} ${player.lastName}`);
    index.set(key, [...(index.get(key) ?? []), player]);
  }
  return index;
}

/**
 * Finds this app's player for a name ESPN reports.
 *
 * One player with the name is a match. Several are narrowed to the one on
 * the reported team; if that still leaves more or fewer than one, there's no
 * match, because linking the wrong player's page is worse than linking none.
 *
 * @param playerName - the name as ESPN spells it.
 * @param teamId - this app's id for the team ESPN lists them under, or null if unmatched.
 * @param index - from buildPlayerNameIndex.
 * @returns the player's id, or null.
 */
export function findPlayerId(playerName: string, teamId: string | null, index: PlayerNameIndex): string | null {
  const candidates = index.get(normalizePersonName(playerName)) ?? [];
  if (candidates.length === 1) return candidates[0].id;
  const onTeam = candidates.filter((candidate) => teamId !== null && candidate.teamId === teamId);
  return onTeam.length === 1 ? onTeam[0].id : null;
}
