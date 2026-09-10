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

export interface FetchGamesParams {
  page?: number;
  pageSize?: number;
}

export function fetchGames(params: FetchGamesParams = {}): Promise<PagedResult<Game>> {
  return fetchJson<PagedResult<Game>>(`/v1/games${toQueryString(params)}`);
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
