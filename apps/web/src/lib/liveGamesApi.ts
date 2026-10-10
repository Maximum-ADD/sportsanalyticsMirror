import { fetchJson } from "./apiClient";

// The live games page's data: NBA-provided stats for games that are live,
// starting within 24 hours, or finished within 18 hours, read through the
// API's stateless proxy of the NBA's live feed (apps/api/src/live). Nothing
// here is derived by this platform's event engine, and none of it is stored.
// Shapes mirror the API's.
//
// Times are UTC ISO 8601 timestamps; clocks and minutes are ISO 8601
// durations ("PT04M12.00S"), the form lib/gameClock.ts already formats.

export type LiveGameStatus = "live" | "final";

export interface LiveTeamSummary {
  teamId: number;
  tricode: string;
  city: string;
  name: string;
  score: number;
}

export interface LiveGameSummary {
  gameId: string;
  /** "Preseason", "Playoffs" and so on; null when the game id doesn't say. */
  seasonType: string | null;
  status: LiveGameStatus;
  /** The NBA's own one-line status, e.g. "Half" or "Final". */
  statusText: string;
  period: number;
  regulationPeriods: number;
  /** Time left in the period; null between periods. */
  gameClock: string | null;
  /** Scheduled tip-off. */
  startsAt: string;
  /** When the final buzzer went; null while live, or when the feed didn't say. */
  endedAt: string | null;
  homeTeam: LiveTeamSummary;
  awayTeam: LiveTeamSummary;
}

export interface ScheduledLiveTeam {
  teamId: number;
  tricode: string;
  city: string;
  name: string;
}

export interface UpcomingLiveGame {
  gameId: string;
  seasonType: string | null;
  /** Scheduled tip-off. Once it has passed, the game is "Starting soon" until its box score appears. */
  startsAt: string;
  /** The NBA's own status when the game is off track ("TBD", "PPD"); shown instead of a countdown. */
  statusNote: string | null;
  homeTeam: ScheduledLiveTeam;
  awayTeam: ScheduledLiveTeam;
}

/** The live page's three sections. */
export interface LiveGamesBoard {
  /** Games in progress, earliest tip-off first. */
  live: LiveGameSummary[];
  /** Games starting within 24 hours (and any running late), soonest first. */
  upcoming: UpcomingLiveGame[];
  /** Games that finished within 18 hours, most recent finish first. */
  recent: LiveGameSummary[];
}

export interface LivePlayerLine {
  personId: number;
  name: string;
  /** "D. Hunter" */
  shortName: string;
  jerseyNumber: string;
  /** Starters only. */
  position: string | null;
  isStarter: boolean;
  hasPlayed: boolean;
  minutes: string;
  points: number;
  assists: number;
  rebounds: number;
  turnovers: number;
  steals: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
}

export interface LivePlay {
  actionNumber: number;
  orderNumber: number;
  period: number;
  clock: string;
  /** Null for game-level actions such as a period starting. */
  teamTricode: string | null;
  description: string;
  homeScore: number;
  awayScore: number;
  isScoringPlay: boolean;
}

export interface LiveGameDetail {
  game: LiveGameSummary;
  /** Players who have taken the floor, starters first. */
  homePlayers: LivePlayerLine[];
  awayPlayers: LivePlayerLine[];
  /** The last five minutes of play, latest first. Null for a finished game, or when it couldn't be read. */
  recentPlays: LivePlay[] | null;
}

export function fetchLiveGames(): Promise<LiveGamesBoard> {
  return fetchJson<LiveGamesBoard>("/v1/live/games");
}

export function fetchLiveGame(gameId: string): Promise<LiveGameDetail> {
  return fetchJson<LiveGameDetail>(`/v1/live/games/${encodeURIComponent(gameId)}`);
}
