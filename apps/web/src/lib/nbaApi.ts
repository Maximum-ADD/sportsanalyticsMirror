import { fetchJson } from "./apiClient";
import type { Game, Lineup, Player, PlayerStatsResponse, PagedResult, Team } from "@/types/nba";

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

export interface FetchTeamsParams {
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
