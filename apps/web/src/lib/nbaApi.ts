import { fetchJson, sendJson } from "./apiClient";
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
  WatchlistEntry,
  Player,
  PlayerComparisonResponse,
  PlayerLeadersResponse,
  PlayerMatchupProjection,
  PlayerPredictionSummary,
  PlayerStatsBatchEntry,
  PlayerStatsResponse,
  PlayerStatsSplitsResponse,
  PlayerStatSort,
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
  // Ranking key — once present the API sorts the whole filtered roster by
  // that season stat before slicing the page, so the first page holds the
  // league's best rather than that page's best. Omitting it keeps the
  // alphabetical default.
  sort?: PlayerStatSort;
  // Direction for `sort` (or the alphabetical default): "desc" puts the
  // biggest figures first, "asc" the smallest. Omitted, the API defaults
  // to desc for stat rankings and asc for alphabetical.
  order?: "asc" | "desc";
  // Participation floor paired with `sort`: only players with at least this
  // many games in the segment make the ranking.
  minGames?: number;
}

export function fetchPlayers(params: FetchPlayersParams = {}): Promise<PagedResult<Player>> {
  return fetchJson<PagedResult<Player>>(`/v1/players${toQueryString(params)}`);
}

// The leader in each headline category for one segment — the figures behind
// the players page's "League leaders" band. The API applies a
// segment-appropriate participation floor (15 games in the regular season, 4
// in postseason segments) unless one is passed explicitly.
export function fetchPlayerLeaders(seasonType?: SeasonType, minGames?: number): Promise<PlayerLeadersResponse> {
  return fetchJson<PlayerLeadersResponse>(`/v1/players/leaders${toQueryString({ seasonType, minGames })}`);
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

// Opponent splits plus an opponent-adjusted projected-points line for every
// game still unplayed on the player's team's schedule — the matchup-
// analysis panel and the projected trend chart. seasonType is deliberately
// left for the API to default (REGULAR): matchups are a regular-season
// concept, the same "don't assert the default client-side" idiom as
// fetchPlayerStats.
export function fetchPlayerMatchupProjection(playerId: string): Promise<PlayerMatchupProjection> {
  return fetchJson<PlayerMatchupProjection>(`/v1/players/${playerId}/matchup-projection`);
}

// Season averages + game log for up to 50 players in one request — see
// PlayersController's stats-batch route for why this exists (a highlight
// pool built from ~15-30 predicted scorers was firing that many sequential
// GET /v1/players/:id/stats calls). A requested id with no ingested stats
// still gets an entry (zeroed averages, empty log), same contract as the
// single-player endpoint, so callers never need to special-case a missing
// map entry.
//
// `seasonType` narrows every entry to one segment; omitted, the rows span
// every segment — the historical behaviour the reliability callers rely on.
// The leaderboard table passes its selected segment so a playoffs table
// shows playoff sparks, not regular-season ones.
export function fetchPlayerStatsBatch(
  playerIds: string[],
  seasonType?: SeasonType
): Promise<{ players: PlayerStatsBatchEntry[] }> {
  const segmentParam = seasonType ? `&seasonType=${seasonType}` : "";
  return fetchJson<{ players: PlayerStatsBatchEntry[] }>(
    `/v1/players/stats-batch?ids=${playerIds.join(",")}${segmentParam}`
  );
}

// The batch endpoint caps a request at MAX_BATCH_STATS_PLAYERS ids and
// rejects anything larger, so a caller holding more ids than that (the
// players page's followed-only view) has to split the fetch. Chunks run
// one after another: even an implausibly long followed list costs a
// handful of round trips, and keeping them sequential avoids a burst of
// simultaneous heavyweight queries against the API's connection pool.
const BATCH_STATS_CHUNK_SIZE = 50;

export async function fetchPlayerStatsBatchInChunks(
  playerIds: string[],
  seasonType?: SeasonType
): Promise<{ players: PlayerStatsBatchEntry[] }> {
  const players: PlayerStatsBatchEntry[] = [];
  for (let offset = 0; offset < playerIds.length; offset += BATCH_STATS_CHUNK_SIZE) {
    const chunk = playerIds.slice(offset, offset + BATCH_STATS_CHUNK_SIZE);
    players.push(...(await fetchPlayerStatsBatch(chunk, seasonType)).players);
  }
  return { players };
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
  return sendJson<GradedPick>("/v1/me/picks", "POST", { gameId, pickedTeamId });
}

export function fetchPickRecord(): Promise<PickRecord> {
  return fetchJson<PickRecord>("/v1/me/picks/record");
}

// Public, like the accuracy ledger — no session required.
export function fetchLeaderboard(): Promise<Leaderboard> {
  return fetchJson<Leaderboard>("/v1/analytics/leaderboard");
}

// ── Watchlist ─────────────────────────────────────────────────────────────
// How the followed players are DOING. Who you follow, and following or
// unfollowing anyone, lives in lib/meApi.ts against /v1/me — there is one
// follow graph and one set of routes that write it.
//
// Session required; a signed-out caller gets a 401, which the board turns
// into a sign-in prompt rather than an error.
export function fetchWatchlist(
  params: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<WatchlistEntry>> {
  return fetchJson<PagedResult<WatchlistEntry>>(`/v1/me/watchlist${toQueryString(params)}`);
}
