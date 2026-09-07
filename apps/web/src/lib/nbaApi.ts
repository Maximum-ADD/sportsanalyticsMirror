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
  PlayerStatsSplitsResponse,
  PagedResult,
  SeasonType,
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
  seasonType?: SeasonType;
  // Only meaningful alongside `seasonType`: narrows the list to players who
  // actually appeared in that segment, so a playoffs view doesn't list an
  // eliminated team's bench.
  participated?: boolean;
}

export function fetchPlayers(params: FetchPlayersParams = {}): Promise<PagedResult<Player>> {
  return fetchJson<PagedResult<Player>>(`/v1/players${toQueryString(params)}`);
}

export function fetchPlayer(playerId: string): Promise<Player> {
  return fetchJson<Player>(`/v1/players/${playerId}`);
}

// Omitting `seasonType` lets the API apply its own default (REGULAR)
// rather than this client asserting one, so the two can't drift apart.
export function fetchPlayerStats(playerId: string, seasonType?: SeasonType): Promise<PlayerStatsResponse> {
  return fetchJson<PlayerStatsResponse>(`/v1/players/${playerId}/stats${toQueryString({ seasonType })}`);
}

// Every segment's season line in one request, for the postseason
// comparison view. See PlayerStatsSplitsResponse.
export function fetchPlayerStatsSplits(playerId: string): Promise<PlayerStatsSplitsResponse> {
  return fetchJson<PlayerStatsSplitsResponse>(`/v1/players/${playerId}/stats/splits`);
}

// Season lines for 2-4 players in one request, for the compare page. Order
// of `playerIds` is preserved in the response.
export function fetchPlayerComparison(
  playerIds: string[],
  seasonType?: SeasonType
): Promise<PlayerComparisonResponse> {
  const segmentParam = seasonType ? `&seasonType=${seasonType}` : "";
  return fetchJson<PlayerComparisonResponse>(`/v1/players/compare?ids=${playerIds.join(",")}${segmentParam}`);
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
  // Omitted means every segment — unlike the player endpoints, the games
  // list has no default segment. See GamesService.getGames.
  seasonType?: SeasonType;
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
