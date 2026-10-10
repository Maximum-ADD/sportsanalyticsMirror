import { fetchJson } from "./apiClient";

// Injuries from ESPN's league-wide report, matched to this app's teams and
// players by the API (apps/api/src/injuries). Nothing is stored; the API reads
// ESPN at most every half hour. Shapes mirror the API's.

/** How serious ESPN rates an injury. */
export type InjurySeverity = "OUT" | "DAY_TO_DAY" | "OTHER";

export interface PlayerInjury {
  /** The name as ESPN spells it. */
  playerName: string;
  /** This app's player id when matched, for linking; null for players the app doesn't hold. */
  playerId: string | null;
  /** ESPN's own wording, e.g. "Out" or "Day-To-Day". */
  status: string;
  severity: InjurySeverity;
  /** e.g. "Knee"; null when ESPN doesn't say. */
  bodyPart: string | null;
  /** "Left" or "Right"; null when ESPN doesn't say. */
  side: string | null;
  /** The diagnosis, e.g. "Tendinitis". */
  detail: string | null;
  /** ESPN's estimated return as a calendar date ("2026-10-10"): an estimate, not an official date. */
  expectedReturn: string | null;
  /** ESPN's short summary, usually crediting the reporter. */
  note: string | null;
  /** When ESPN last updated the entry, UTC ISO 8601. */
  updatedAt: string | null;
}

export interface TeamInjuryReport {
  /** When the API read ESPN's report, UTC ISO 8601. */
  fetchedAt: string;
  injuries: PlayerInjury[];
}

export interface PlayerInjuryReport {
  fetchedAt: string;
  /** Null when the player isn't on the report. */
  injury: PlayerInjury | null;
}

export function fetchTeamInjuries(teamId: string): Promise<TeamInjuryReport> {
  return fetchJson<TeamInjuryReport>(`/v1/teams/${encodeURIComponent(teamId)}/injuries`);
}

export function fetchPlayerInjury(playerId: string): Promise<PlayerInjuryReport> {
  return fetchJson<PlayerInjuryReport>(`/v1/players/${encodeURIComponent(playerId)}/injury`);
}
