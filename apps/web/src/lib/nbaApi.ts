import { deleteJson, fetchJson, patchJson, postJson } from "./apiClient";
import type {
  Game,
  GameDetail,
  GamePrediction,
  Lineup,
  ChallengeGame,
  GradedPick,
  Leaderboard,
  ModelAccuracyReport,
  PickRecord,
  PlayerFollow,
  WatchlistEntry,
  Player,
  PlayerComparisonResponse,
  PlayerPredictionSummary,
  PlayerStatsBatchEntry,
  PlayerStatsResponse,
  PlayerStatsSplitsResponse,
  PagedResult,
  SeasonType,
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

// Season averages + game log for up to 50 players in one request — see
// PlayersController's stats-batch route for why this exists (a highlight
// pool built from ~15-30 predicted scorers was firing that many sequential
// GET /v1/players/:id/stats calls). A requested id with no ingested stats
// still gets an entry (zeroed averages, empty log), same contract as the
// single-player endpoint, so callers never need to special-case a missing
// map entry.
export function fetchPlayerStatsBatch(playerIds: string[]): Promise<{ players: PlayerStatsBatchEntry[] }> {
  return fetchJson<{ players: PlayerStatsBatchEntry[] }>(`/v1/players/stats-batch?ids=${playerIds.join(",")}`);
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
  // Omitted means every segment — unlike the player endpoints, the games
  // list has no default segment. See GamesService.getGames.
  seasonType?: SeasonType;
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

// Public — no session required, so the home page's published-figures section
// renders the same for a signed-out visitor as for anyone else.
export function fetchModelAccuracy(): Promise<ModelAccuracyReport> {
  return fetchJson<ModelAccuracyReport>("/v1/analytics/model-accuracy");
}

// ── Beat the Model ────────────────────────────────────────────────────────
// All three need a session; a signed-out caller gets a 401 that the UI turns
// into a sign-in prompt rather than an error.

// Throws ApiError 404 once the user has called every game we hold.
export function fetchNextChallenge(): Promise<ChallengeGame> {
  return fetchJson<ChallengeGame>("/v1/me/challenge/next");
}

export function submitPick(gameId: string, pickedTeamId: string): Promise<GradedPick> {
  return postJson<GradedPick>("/v1/me/picks", { gameId, pickedTeamId });
}

export function fetchPickRecord(): Promise<PickRecord> {
  return fetchJson<PickRecord>("/v1/me/picks/record");
}

// Public, like the accuracy ledger — no session required.
export function fetchLeaderboard(): Promise<Leaderboard> {
  return fetchJson<Leaderboard>("/v1/analytics/leaderboard");
}

// ── Watchlist ─────────────────────────────────────────────────────────────
// Session required; a signed-out caller gets a 401 the board turns into a
// sign-in prompt rather than an error.

export function fetchWatchlist(
  params: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<WatchlistEntry>> {
  return fetchJson<PagedResult<WatchlistEntry>>(`/v1/me/watchlist${toQueryString(params)}`);
}

// Idempotent — the home page's follow control must be safe to double-tap.
export function followPlayer(playerId: string): Promise<PlayerFollow> {
  return postJson<PlayerFollow>(`/v1/me/follows/players/${playerId}`, {});
}

// Just the ids, so a follow button can render its own state without paging
// the whole board.
export function fetchWatchedPlayerIds(): Promise<{ playerIds: string[] }> {
  return fetchJson<{ playerIds: string[] }>("/v1/me/watchlist/ids");
}

// Replaces the scouting note on a player already followed. 404s rather than
// creating the follow, so the caller cannot accidentally follow by annotating.
export function updateWatchlistNote(playerId: string, note: string | null): Promise<PlayerFollow> {
  return patchJson<PlayerFollow>(`/v1/me/follows/players/${playerId}`, { note });
}

// Unfollowing someone you never followed is not an error — the route reports
// { playerId, removed } so the caller can tell the difference.
export function unfollowPlayer(playerId: string): Promise<{ playerId: string; removed: boolean }> {
  return deleteJson<{ playerId: string; removed: boolean }>(`/v1/me/follows/players/${playerId}`);
}
