import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { DEFAULT_SEASON_TYPE, parseSeasonType } from "../common/season-type.js";
import { PlayersService } from "./players.service.js";
import {
  StatsService,
  type PlayerComparisonEntry,
  type PlayerSeasonSplits,
  type PlayerStatsEntry,
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

// Generous relative to /compare's 4-player cap on purpose — this backs
// cross-game highlight pools (see PlayerCards.tsx's usePlayerReliability),
// not a side-by-side UI that stops being readable past a handful of tiles.
// Still bounded so a caller can't turn this into an unbounded full-table
// scan.
const MAX_BATCH_STATS_PLAYERS = 50;

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

  // GET /v1/players?teamId=&position=&search=&page=&pageSize= — paginated player list.
  @Get()
  @ApiOperation({ summary: "List players (paginated)" })
  @ApiQuery({ name: "teamId", required: false, description: "Filter by team ID" })
  @ApiQuery({ name: "position", required: false, description: "Filter by position (PG, SG, SF, PF, C)" })
  @ApiQuery({ name: "search", required: false, description: "Search by player name" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number (default: 1)" })
  @ApiQuery({ name: "pageSize", required: false, type: Number, description: "Items per page (default: 25, max: 100)" })
  @ApiResponse({ status: 200, description: "Paginated player list" })
  listPlayers(@Query() query: Record<string, unknown>) {
    return this.playersService.getPlayers(query);
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

    const players = await Promise.all(
      playerIds.map(async (id) => {
        const player = await this.playersService.getPlayerById(id);
        if (!player) {
          throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", `Player ${id} not found`);
        }
        const seasonAverages = await this.statsService.getPlayerSeasonAverages(id, seasonType);
        return { player, seasonAverages };
      })
    );
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
  async getPlayerStatsBatch(@Query("ids") ids: unknown): Promise<{ players: PlayerStatsEntry[] }> {
    const playerIds = parseBatchStatsIds(ids);
    const players = await this.statsService.getPlayerStatsBatch(playerIds);
    return { players };
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
  async getPlayerStats(@Param("id") id: string, @Query("seasonType") rawSeasonType: unknown) {
    const seasonType = parseSeasonType(rawSeasonType) ?? DEFAULT_SEASON_TYPE;

    const player = await this.playersService.getPlayerById(id);
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }

    const [seasonAverages, gameLog] = await Promise.all([
      this.statsService.getPlayerSeasonAverages(id, seasonType),
      this.statsService.getPlayerGameLog(id, seasonType),
    ]);
    return { playerId: id, seasonType, seasonAverages, gameLog };
  }
}
