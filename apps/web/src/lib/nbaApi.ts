import { fetchJson } from "./apiClient";
import type {
  Game,
  GameDetail,
  GamePrediction,
  Lineup,
  Player,
  PlayerComparisonResponse,
  PlayerPredictionSummary,
  PlayerStatsResponse,
  PagedResult,
  Team,
  TeamEloRating,
} from "@/types/nba";

function toQueryString(params: object): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined
  );
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export interface FetchPlayersParams {
  teamId?: string;
  position?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function fetchPlayers(params: FetchPlayersParams = {}): Promise<PagedResult<Player>> {
  return fetchJson<PagedResult<Player>>(`/v1/players${toQueryString(params)}`);
}

export function fetchPlayer(playerId: string): Promise<Player> {
  return fetchJson<Player>(`/v1/players/${playerId}`);
}

export function fetchPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
  return fetchJson<PlayerStatsResponse>(`/v1/players/${playerId}/stats`);
}

// Season averages + game log for up to 50 players in one request — see
// PlayersController's stats-batch route for why this exists (a highlight
// pool built from ~15-30 predicted scorers was firing that many sequential
// GET /v1/players/:id/stats calls). A requested id with no ingested stats
// still gets an entry (zeroed averages, empty log), same contract as the
// single-player endpoint, so callers never need to special-case a missing
// map entry.
export function fetchPlayerStatsBatch(playerIds: string[]): Promise<{ players: PlayerStatsResponse[] }> {
  return fetchJson<{ players: PlayerStatsResponse[] }>(`/v1/players/stats-batch?ids=${playerIds.join(",")}`);
}

// Season lines for 2-4 players in one request, for the compare page. Order
// of `playerIds` is preserved in the response.
export function fetchPlayerComparison(playerIds: string[]): Promise<PlayerComparisonResponse> {
  return fetchJson<PlayerComparisonResponse>(`/v1/players/compare?ids=${playerIds.join(",")}`);
}

export interface FetchTeamsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function fetchTeams(params: FetchTeamsParams = {}): Promise<PagedResult<Team>> {
  return fetchJson<PagedResult<Team>>(`/v1/teams${toQueryString(params)}`);
}

export function fetchTeam(teamId: string): Promise<Team> {
  return fetchJson<Team>(`/v1/teams/${teamId}`);
}

// Every team's current Elo rating, highest first — see TeamEloRating for
// what "current" means here (an upcoming game's snapshot when a team has
// one, since that IS the live rating; otherwise its last completed game's).
export function fetchEloRatings(): Promise<TeamEloRating[]> {
  return fetchJson<TeamEloRating[]>("/v1/teams/elo-ratings");
}

export interface FetchGamesParams {
  page?: number;
  pageSize?: number;
  // "upcoming"/"completed" narrow to one group; omitted (or "all") returns
  // soonest-upcoming-first then most-recent-completed — see
  // GamesService.getGames for why this can't just be a gameDate sort.
  status?: "upcoming" | "completed" | "all";
  // Exact Game.season match (e.g. "2025-26") — see fetchSeasons for real,
  // available options rather than guessing a season string.
  season?: string;
}

export function fetchGames(params: FetchGamesParams = {}): Promise<PagedResult<Game>> {
  return fetchJson<PagedResult<Game>>(`/v1/games${toQueryString(params)}`);
}

// Every season with at least one ingested game, most recent first — backs
// a season filter with real options instead of a hardcoded/guessed list.
export function fetchSeasons(): Promise<string[]> {
  return fetchJson<string[]>("/v1/games/seasons");
}

export function fetchLatestLineup(): Promise<Lineup> {
  return fetchJson<Lineup>("/v1/optimizer/lineup");
}

export function fetchPlayerPrediction(playerId: string): Promise<PlayerPredictionSummary> {
  return fetchJson<PlayerPredictionSummary>(`/v1/optimizer/predictions/${playerId}`);
}

export function fetchGamePrediction(gameId: string): Promise<GamePrediction> {
  return fetchJson<GamePrediction>(`/v1/games/${gameId}/prediction`);
}

export function fetchGameDetail(gameId: string): Promise<GameDetail> {
  return fetchJson<GameDetail>(`/v1/games/${gameId}`);
}
