import { fetchJson } from "./apiClient";
import { toQueryString } from "./nbaApi";

// The all-time leaders page's data: the NBA's own career totals across its
// whole history, stored by apps/ingestion/all_time_leaders.py and served by
// GET /v1/all-time-leaders. Shapes mirror the API's
// (apps/api/src/all-time-leaders/all-time-leaders.service.ts).

export type AllTimeLeaderCategory =
  | "GAMES_PLAYED"
  | "POINTS"
  | "ASSISTS"
  | "STEALS"
  | "OFFENSIVE_REBOUNDS"
  | "DEFENSIVE_REBOUNDS"
  | "REBOUNDS"
  | "BLOCKS"
  | "FIELD_GOALS_MADE"
  | "THREES_MADE"
  | "FREE_THROWS_MADE";

/** The NBA's playoff career totals include the Finals, so there are only two. */
export type AllTimeLeaderSeasonType = "REGULAR" | "PLAYOFFS";

/** Every bio field but the name can be null: not every bio has been fetched, and early-era players have gaps. */
export interface AllTimeLeaderPlayer {
  nbaPlayerId: number;
  firstName: string;
  lastName: string;
  position: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  /** ISO 8601 timestamp. */
  birthDate: string | null;
  school: string | null;
  country: string | null;
  /** First and last season played, as the year each season started. */
  fromYear: number | null;
  toYear: number | null;
  seasonExp: number | null;
  draftYear: number | null;
  draftRound: number | null;
  draftNumber: number | null;
  isGreatest75: boolean;
  isActive: boolean;
  /** This app's player id when it holds the player, for linking to their profile; null for most retired players. */
  playerId: string | null;
}

export interface AllTimeLeaderEntry {
  /** The NBA's rank: tied totals share one. */
  rank: number;
  /** A career total. */
  value: number;
  player: AllTimeLeaderPlayer;
}

export interface AllTimeLeaderboard {
  category: AllTimeLeaderCategory;
  seasonType: AllTimeLeaderSeasonType;
  /** When the figures were fetched from the NBA; null (with no leaders) before the first load. */
  fetchedAt: string | null;
  leaders: AllTimeLeaderEntry[];
}

export function fetchAllTimeLeaders(
  category: AllTimeLeaderCategory,
  seasonType: AllTimeLeaderSeasonType
): Promise<AllTimeLeaderboard> {
  return fetchJson<AllTimeLeaderboard>(`/v1/all-time-leaders${toQueryString({ category, seasonType })}`);
}
