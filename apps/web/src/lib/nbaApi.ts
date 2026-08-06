import { fetchJson } from "./apiClient";
import type { Player, PlayerStatsResponse, PagedResult } from "../types/nba";

export function fetchPlayers(): Promise<PagedResult<Player>> {
  return fetchJson<PagedResult<Player>>("/v1/players");
}

export function fetchPlayer(playerId: string): Promise<Player> {
  return fetchJson<Player>(`/v1/players/${playerId}`);
}

export function fetchPlayerStats(playerId: string): Promise<PlayerStatsResponse> {
  return fetchJson<PlayerStatsResponse>(`/v1/players/${playerId}/stats`);
}
