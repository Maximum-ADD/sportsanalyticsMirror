import { Controller, Get, HttpStatus, Param, Query, Res } from "@nestjs/common";
import { SeasonType } from "@prisma/client";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from "@nestjs/swagger";
import type { Response } from "express";
import { ApiException } from "../common/api-exception.js";
import { toCsv } from "../common/csv.js";
import { DEFAULT_SEASON_TYPE, parseSeasonType } from "../common/season-type.js";
import { PlayersService, type PlayerWithTeam } from "./players.service.js";
import {
  DEFAULT_LEADERS_MIN_GAMES,
  POSTSEASON_LEADERS_MIN_GAMES,
  parseMinGames,
  parsePlayerStatSort,
  parseSortOrder,
  StatsService,
  type CareerStats,
  type LeagueAverages,
  type PlayerComparisonEntry,
  type PlayerMatchupProjection,
  type PlayerSeasonSplits,
  type PlayerStatsEntry,
  type SeasonLeaders,
} from "./stats.service.js";

// A comparison needs at least two players to be a comparison, and the UI
// lays out at most four tiles side by side before it stops being readable.
const MIN_COMPARISON_PLAYERS = 2;
const MAX_COMPARISON_PLAYERS = 4;

// Turns the raw `?ids=a,b,c` query value into a de-duplicated list of player
// ids, preserving first-seen order. Throws a 400 when the count falls outside
// the supported range so the caller gets a clear error rather than a partial
// or oversized comparison.
function parseComparisonIds(ids: unknown): string[] {
  const rawIds = typeof ids === "string" ? ids.split(",").map((id) => id.trim()).filter(Boolean) : [];
  const uniqueIds = [...new Set(rawIds)];

  if (uniqueIds.length < MIN_COMPARISON_PLAYERS || uniqueIds.length > MAX_COMPARISON_PLAYERS) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "BAD_REQUEST",
      `A comparison needs between ${MIN_COMPARISON_PLAYERS} and ${MAX_COMPARISON_PLAYERS} player ids`
    );
  }
  return uniqueIds;
}

// A cap on the export endpoint's row count, independent of the paginated
// list's own MAX_PAGE_SIZE — an export is one deliberate download, not a
// page a user clicks through, so it can return far more than 100 rows,
// but still needs *some* ceiling protecting the DB from an unbounded
// full-table scan behind an unauthenticated GET.
const MAX_EXPORT_ROWS = 5000;

const PLAYER_EXPORT_COLUMNS: { header: string; value: (player: PlayerWithTeam) => string | number | null }[] = [
  { header: "id", value: (player) => player.id },
  { header: "nbaPlayerId", value: (player) => player.nbaPlayerId },
  { header: "firstName", value: (player) => player.firstName },
  { header: "lastName", value: (player) => player.lastName },
  { header: "position", value: (player) => player.position },
  { header: "jerseyNumber", value: (player) => player.jerseyNumber },
  { header: "heightInches", value: (player) => player.heightInches },
  { header: "weightLbs", value: (player) => player.weightLbs },
  { header: "teamAbbreviation", value: (player) => player.team?.abbreviation ?? null },
  { header: "teamCity", value: (player) => player.team?.city ?? null },
  { header: "teamName", value: (player) => player.team?.name ?? null },
];

// Generous relative to /compare's 4-player cap on purpose — this backs
// cross-game highlight pools (see PlayerCards.tsx's usePlayerReliability),
// not a side-by-side UI that stops being readable past a handful of tiles.
// Still bounded so a caller can't turn this into an unbounded full-table
// scan.
const MAX_BATCH_STATS_PLAYERS = 50;
const AGGREGATE_METRICS = ["pointsPerGame", "reboundsPerGame", "assistsPerGame"] as const;
type AggregateMetric = (typeof AGGREGATE_METRICS)[number];

function parseAggregateMetric(metric: unknown): AggregateMetric {
  if (typeof metric === "string" && AGGREGATE_METRICS.includes(metric as AggregateMetric)) return metric as AggregateMetric;
  throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", `metric must be one of ${AGGREGATE_METRICS.join(", ")}`);
}

function parseBatchStatsIds(ids: unknown): string[] {
  const rawIds = typeof ids === "string" ? ids.split(",").map((id) => id.trim()).filter(Boolean) : [];
  const uniqueIds = [...new Set(rawIds)];

  if (uniqueIds.length === 0) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "At least one player id is required");
  }
  if (uniqueIds.length > MAX_BATCH_STATS_PLAYERS) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "BAD_REQUEST",
      `At most ${MAX_BATCH_STATS_PLAYERS} player ids are supported per request`
    );
  }
  return uniqueIds;
}

@ApiTags("players")
@Controller("v1/players")
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly statsService: StatsService
  ) {}

  // GET /v1/players?teamId=&position=&search=&page=&pageSize=&sort=&order=&minGames=
  // — paginated player list. Alphabetical by last name is the default; once
  // `sort`, `order`, or `minGames` appears the request is a leaderboard and
  // the ranking runs league-wide in StatsService before the page slice, so
  // one page's best never masquerades as the league's best. `order` alone
  // still routes here: it is the direction of the alphabetical default, and
  // the plain listing path can't honour a descending one.
  @Get()
  @ApiOperation({ summary: "List players (paginated)" })
  @ApiQuery({ name: "teamId", required: false, description: "Filter by team ID" })
  @ApiQuery({ name: "position", required: false, description: "Filter by position (PG, SG, SF, PF, C)" })
  @ApiQuery({ name: "search", required: false, description: "Search by player name" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number (default: 1)" })
  @ApiQuery({ name: "pageSize", required: false, type: Number, description: "Items per page (default: 25, max: 100)" })
  @ApiQuery({ name: "sort", required: false, description: "Rank by a season stat (ppg, rpg, apg, ts); omitted means alphabetical" })
  @ApiQuery({ name: "order", required: false, description: "Sort direction (asc, desc); defaults to desc for stat rankings, asc for alphabetical" })
  @ApiQuery({ name: "minGames", required: false, type: Number, description: "Only players with at least this many games in the segment" })
  @ApiResponse({ status: 200, description: "Paginated player list" })
  listPlayers(@Query() query: Record<string, unknown>) {
    if (
      parsePlayerStatSort(query.sort) !== undefined ||
      parseSortOrder(query.order) !== undefined ||
      parseMinGames(query.minGames) !== undefined
    ) {
      return this.statsService.getPlayersRanked(query);
    }
    return this.playersService.getPlayers(query);
  }

  // GET /v1/players/export?teamId=&position=&search= — the same filters
  // as the paginated list above, as a downloadable CSV file instead of a
  // JSON page: "an analyst should be able to export a filtered slice of
  // the data as a file for use elsewhere" (the brief, verbatim). Declared
  // before ":id" so "export" is never swallowed as a player id.
  //
  // Bio/identity fields only, matching what the list endpoint's own rows
  // carry — not derived season stats, which would mean either an N+1 fetch
  // per exported player or a bulk-stats join this route doesn't build; a
  // roster export is still a real, useful "filtered slice… for use
  // elsewhere" on its own; joining stats in is a documented follow-up, not
  // silently missing scope.
  @Get("export")
  @ApiOperation({ summary: "Export a filtered slice of players as CSV" })
  @ApiQuery({ name: "teamId", required: false, description: "Filter by team ID" })
  @ApiQuery({ name: "position", required: false, description: "Filter by position (PG, SG, SF, PF, C)" })
  @ApiQuery({ name: "search", required: false, description: "Search by player name" })
  @ApiResponse({ status: 200, description: "CSV file" })
  async exportPlayers(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const players = await this.playersService.getMatchingPlayers(query, MAX_EXPORT_ROWS);
    const csv = toCsv(players, PLAYER_EXPORT_COLUMNS);
    res
      .status(HttpStatus.OK)
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="players.csv"',
      })
      .send(csv);
  }

  // GET /v1/players/compare?ids=a,b,c&seasonType=PLAYOFFS — the same
  // derived season line as /:id/stats, for 2-4 players at once, so the
  // compare page makes one request instead of N. Declared before the ":id"
  // route so "compare" is never swallowed as a player id.
  //
  // seasonType is accepted here for the same reason it is on /:id/stats:
  // comparing two players from inside a postseason view has to compare
  // their postseason lines, or the comparison silently answers a different
  // question than the one on screen.
  //
  // Two queries whatever the player count: one for the players and one for
  // every player's boxscore rows, rather than two per player.
  @Get("compare")
  @ApiOperation({ summary: "Compare 2-4 players side by side" })
  @ApiQuery({ name: "ids", required: true, description: "Comma-separated list of 2-4 player UUIDs" })
  @ApiQuery({ name: "seasonType", required: false, description: "Season segment to compare (e.g. REGULAR, PLAYOFFS, FINALS). Defaults to REGULAR." })
  @ApiResponse({ status: 200, description: "Player comparison data" })
  @ApiResponse({ status: 400, description: "Invalid player IDs" })
  @ApiResponse({ status: 404, description: "One or more players not found" })
  async comparePlayers(
    @Query("ids") ids: unknown,
    @Query("seasonType") rawSeasonType: unknown
  ): Promise<{ seasonType: string; players: PlayerComparisonEntry[] }> {
    const playerIds = parseComparisonIds(ids);
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;

    const [foundPlayers, statsEntries] = await Promise.all([
      this.playersService.getPlayersByIds(playerIds),
      this.statsService.getPlayerStatsBatch(playerIds, seasonType),
    ]);
    const playerById = new Map(foundPlayers.map((player) => [player.id, player]));

    // getPlayerStatsBatch returns one entry per requested id in request
    // order, so zipping by index keeps the response in the order asked for.
    const players = playerIds.map((id, index) => {
      const player = playerById.get(id);
      if (!player) {
        throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", `Player ${id} not found`);
      }
      return { player, seasonAverages: statsEntries[index].seasonAverages };
    });
    return { seasonType, players };
  }

  // GET /v1/players/stats-batch?ids=a,b,c — season averages + game log for
  // up to MAX_BATCH_STATS_PLAYERS players in one request, one query instead
  // of N (see PlayersService.getPlayerSeasonStatsBatch). Declared before
  // ":id" so "stats-batch" is never swallowed as a player id. Unlike
  // /compare, a player id with no matching Player row is silently skipped
  // rather than 404ing the whole batch — this endpoint backs a highlight
  // pool built from predicted scorers already known to exist (see
  // GameDetailService), not a user-typed id, so a mismatch here would be
  // this app's own bug, not bad input worth surfacing to the caller as an
  // error.
  @Get("stats-batch")
  async getPlayerStatsBatch(
    @Query("ids") ids: unknown,
    @Query("seasonType") rawSeasonType: unknown
  ): Promise<{ players: PlayerStatsEntry[] }> {
    const playerIds = parseBatchStatsIds(ids);
    const seasonType = parseSeasonType(rawSeasonType);
    const players = await this.statsService.getPlayerStatsBatch(playerIds, seasonType);
    return { players };
  }

  // GET /v1/players/leaders?seasonType=&minGames= — the leader in each
  // headline category (PPG/RPG/APG/TS%) for one segment, after a
  // participation floor. Declared before ":id" so "leaders" is never
  // swallowed as a player id. The floor defaults to a near-full regular
  // season (DEFAULT_LEADERS_MIN_GAMES) and drops to a postseason-sized
  // sample (POSTSEASON_LEADERS_MIN_GAMES) for the short playoff segments,
  // where the regular-season floor would leave every category leaderless.
  @Get("leaders")
  @ApiOperation({ summary: "Season leaders by headline category" })
  @ApiQuery({ name: "seasonType", required: false, description: "Season segment (e.g. REGULAR, PLAYOFFS, FINALS). Defaults to REGULAR." })
  @ApiQuery({ name: "asOf", required: false, description: "ISO-8601 instant; only games completed by this time contribute to the response" })
  @ApiQuery({ name: "minGames", required: false, type: Number, description: "Participation floor; defaults to 15 in the regular season, 4 in postseason segments" })
  @ApiResponse({ status: 200, description: "Season leaders by category" })
  async getSeasonLeaders(
    @Query("seasonType") rawSeasonType: unknown,
    @Query("minGames") rawMinGames: unknown
  ): Promise<{ seasonType: SeasonType; minGames: number; leaders: SeasonLeaders }> {
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;
    const defaultMinGames =
      seasonType === SeasonType.REGULAR ? DEFAULT_LEADERS_MIN_GAMES : POSTSEASON_LEADERS_MIN_GAMES;
    const minGames = parseMinGames(rawMinGames) ?? defaultMinGames;

    const leaders = await this.statsService.getSeasonLeaders(seasonType, minGames);
    return { seasonType, minGames, leaders };
  }

  // GET /v1/players/:id/matchup-projection?seasonType= — how this player
  // has scored against each opponent, plus an opponent-adjusted projected
  // points line for every game still unplayed on their team's schedule
  // (the basis of the profile page's projected trend chart). Declared
  // before ":id" so the literal segment wins over the parameter route.
  @Get(":id/matchup-projection")
  @ApiOperation({ summary: "Opponent splits and upcoming-game scoring projections" })
  @ApiParam({ name: "id", description: "Player UUID" })
  @ApiQuery({ name: "seasonType", required: false, description: "Season segment the splits are drawn from (e.g. REGULAR, PLAYOFFS, FINALS). Defaults to REGULAR." })
  @ApiResponse({ status: 200, description: "Opponent splits and upcoming-game projections" })
  @ApiResponse({ status: 404, description: "Player not found" })
  async getMatchupProjection(
    @Param("id") id: string,
    @Query("seasonType") rawSeasonType: unknown
  ): Promise<PlayerMatchupProjection> {
    const projection = await this.statsService.getMatchupProjection(id, rawSeasonType);
    if (!projection) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }
    return projection;
  }

  // GET /v1/players/league-averages?seasonType=REGULAR — competition-wide
  // averages across every player in one segment, the benchmark line a
  // career tab or leaders page can show "league average" against.
  // Declared before ":id" so "league-averages" is never swallowed as a
  // player id.
  @Get("league-averages")
  @ApiOperation({ summary: "Competition-wide averages for one season segment" })
  @ApiQuery({ name: "seasonType", required: false, description: "Season segment (e.g. REGULAR, PLAYOFFS, FINALS). Defaults to REGULAR." })
  @ApiResponse({ status: 200, description: "League-wide averages" })
  async getLeagueAverages(@Query("seasonType") rawSeasonType: unknown): Promise<LeagueAverages> {
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;
    return this.statsService.getLeagueAverages(seasonType);
  }

  @Get("aggregates")
  @ApiOperation({ summary: "Aggregate player metrics by team or position" })
  @ApiQuery({ name: "metric", required: true, description: "pointsPerGame, reboundsPerGame, or assistsPerGame" })
  @ApiQuery({ name: "groupBy", required: false, description: "team or position; defaults to team" })
  async getAggregates(
    @Query("metric") rawMetric: unknown,
    @Query("groupBy") rawGroupBy: unknown,
    @Query("seasonType") rawSeasonType: unknown
  ) {
    const metric = parseAggregateMetric(rawMetric);
    const groupBy = rawGroupBy === "position" ? "position" : "team";
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;
    const players = await this.playersService.getMatchingPlayers({});
    const stats = await this.statsService.getPlayerStatsBatch(players.map((player) => player.id), seasonType);
    const valuesByGroup = new Map<string, number[]>();

    players.forEach((player, index) => {
      const group = groupBy === "position" ? player.position : player.team?.abbreviation ?? "UNASSIGNED";
      const values = valuesByGroup.get(group) ?? [];
      values.push(stats[index].seasonAverages[metric]);
      valuesByGroup.set(group, values);
    });

    return {
      metric,
      groupBy,
      seasonType,
      groups: [...valuesByGroup.entries()].map(([group, values]) => ({
        group,
        playerCount: values.length,
        average: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
      })),
    };
  }

  // GET /v1/players/:id/stats/career — career totals + averages + per-season
  // breakdown, the numbers behind a "Career" tab on the player profile.
  // Declared before ":id/stats" so "career" is never read as part of that route.
  @Get(":id/stats/career")
  @ApiOperation({ summary: "Career totals, averages, and per-season breakdown" })
  @ApiParam({ name: "id", description: "Player UUID" })
  @ApiResponse({ status: 200, description: "Career stats" })
  @ApiResponse({ status: 404, description: "Player not found" })
  async getCareerStats(@Param("id") id: string): Promise<{ playerId: string; career: CareerStats }> {
    const career = await this.statsService.getCareerStats(id);
    if (!career) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }
    return { playerId: id, career };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get player by ID" })
  @ApiParam({ name: "id", description: "Player UUID" })
  @ApiResponse({ status: 200, description: "Player details with team" })
  @ApiResponse({ status: 404, description: "Player not found" })
  async getPlayer(@Param("id") id: string) {
    const player = await this.playersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }
    return player;
  }

  // GET /v1/players/:id/stats/splits — the same derived season line as
  // /:id/stats, but for every season segment at once, so the postseason
  // comparison view makes one request instead of four. Declared before
  // ":id/stats" so "splits" is never read as part of that route.
  @Get(":id/stats/splits")
  async getPlayerStatsSplits(@Param("id") id: string): Promise<{ playerId: string; splits: PlayerSeasonSplits }> {
    const player = await this.playersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }

    const splits = await this.statsService.getPlayerSeasonSplits(id);
    return { playerId: id, splits };
  }

  // GET /v1/players/:id/stats?seasonType=PLAYOFFS — season averages and
  // points-by-game log, both derived at request time from this player's
  // PlayerGameStat rows for that one segment. seasonType defaults to
  // REGULAR, so callers written before the postseason views behave exactly
  // as they did. The response echoes the segment back so a caller can't
  // mislabel a chart it already rendered.
  @Get(":id/stats")
  @ApiOperation({ summary: "Get player season averages and game log" })
  @ApiParam({ name: "id", description: "Player UUID" })
  @ApiQuery({ name: "seasonType", required: false, description: "Season segment (e.g. REGULAR, PLAYOFFS, FINALS). Defaults to REGULAR." })
  @ApiResponse({ status: 200, description: "Season averages and game log" })
  @ApiResponse({ status: 404, description: "Player not found" })
  async getPlayerStats(
    @Param("id") id: string,
    @Query("seasonType") rawSeasonType: unknown,
    @Query("asOf") rawAsOf: unknown
  ) {
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;
    const asOf = typeof rawAsOf === "string" ? new Date(rawAsOf) : undefined;
    if (asOf && Number.isNaN(asOf.getTime())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "asOf must be an ISO-8601 timestamp");
    }

    const player = await this.playersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }

    const { seasonAverages, gameLog } = asOf
      ? await this.statsService.getPlayerSeasonLineAsOf(id, seasonType, asOf)
      : await this.statsService.getPlayerSeasonLine(id, seasonType);
    return { playerId: id, seasonType, asOf: asOf?.toISOString(), seasonAverages, gameLog };
  }
}
