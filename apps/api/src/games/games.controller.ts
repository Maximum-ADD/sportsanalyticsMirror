import { Controller, Get, HttpStatus, Param, Query, Res } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { ApiException } from "../common/api-exception.js";
import { parsePageParams } from "../common/pagination.js";
import { toCsv, type ColumnSpec } from "../common/csv.js";
import type { Response } from "express";
import { GameDetailService } from "./game-detail.service.js";
import { GamesService } from "./games.service.js";

// Public, like TeamsController/PlayersController — games/schedules/scores
// are the same kind of read-only, non-personal data those already expose
// with no guard. Also lets the landing page's live-match widget (rendered
// for signed-out visitors) call this endpoint at all.
@ApiTags("games")
@Controller("v1/games")
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly gameDetailService: GameDetailService
  ) {}

  @Get()
  @ApiOperation({ summary: "List games (paginated, most recent first)" })
  @ApiResponse({ status: 200, description: "Paginated game list with predictions" })
  listGames(@Query() query: Record<string, unknown>) {
    return this.gamesService.getGames(query);
  }

  @Get("export")
  @ApiOperation({ summary: "Export a filtered game slice as CSV" })
  async exportGames(@Query() query: Record<string, unknown>, @Res() response: Response): Promise<void> {
    const games = await this.gamesService.getGamesForExport(query, 5_000);
    const columns: ColumnSpec<(typeof games)[number]>[] = [
      { header: "id", value: (game) => game.id },
      { header: "nbaGameId", value: (game) => game.nbaGameId },
      { header: "gameDate", value: (game) => game.gameDate.toISOString() },
      { header: "season", value: (game) => game.season },
      { header: "seasonType", value: (game) => game.seasonType },
      { header: "homeTeam", value: (game) => game.homeTeam.name },
      { header: "awayTeam", value: (game) => game.awayTeam.name },
      { header: "homeScore", value: (game) => game.homeScore },
      { header: "awayScore", value: (game) => game.awayScore },
    ];
    response.status(HttpStatus.OK).set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="games.csv"',
    }).send(toCsv(games, columns));
  }

  // GET /v1/games/seasons — every season with at least one ingested game,
  // most recent first. Declared before the :id route below so "seasons"
  // isn't swallowed as a game id — Nest matches routes in declaration
  // order. Backs the Predictions page's season filter with real options.
  @Get("seasons")
  listSeasons() {
    return this.gamesService.getSeasons();
  }

  @Get(":id/live")
  @ApiOperation({ summary: "Poll newly received events for an in-progress fixture" })
  @ApiParam({ name: "id", description: "Game UUID" })
  async getLiveFeed(@Param("id") id: string, @Query("afterSequence") rawAfterSequence: unknown) {
    const game = await this.gamesService.getGameById(id);
    if (!game) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    const afterSequence = typeof rawAfterSequence === "string" ? Number(rawAfterSequence) : -1;
    if (!Number.isInteger(afterSequence) || afterSequence < -1) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "afterSequence must be a non-negative integer");
    }
    const events = await this.gamesService.getLiveEvents(id, afterSequence);
    return { gameId: id, events, nextSequence: events.at(-1)?.sequence ?? afterSequence, pollAfterMilliseconds: 5_000 };
  }

  // GET /v1/games/:id — a single game with its win probability/predicted
  // margin (if generated), market odds (if fetched — see
  // apps/ingestion/fetch_market_odds.py) and predicted top scorers from
  // both rosters — everything the game detail page needs in one request.
  @Get(":id")
  @ApiOperation({ summary: "Get game detail with prediction and predicted scorers" })
  @ApiParam({ name: "id", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Full game detail" })
  @ApiResponse({ status: 404, description: "Game not found" })
  async getGame(@Param("id") id: string) {
    const detail = await this.gameDetailService.getGameDetail(id);
    if (!detail) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }
    return detail;
  }

  // GET /v1/games/:id/prediction — the Elo win probability and Four
  // Factors predicted margin for this game, written by apps/predictor's
  // predict_games.py. Two-step 404: game not found vs. game found but not
  // yet predicted are different problems, same pattern as
  // PlayersController's :id/stats route. getGameById already joins the
  // prediction, so both checks come from one query.
  @Get(":id/prediction")
  @ApiOperation({ summary: "Get Elo win probability and Four Factors prediction" })
  @ApiParam({ name: "id", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Game prediction" })
  @ApiResponse({ status: 404, description: "Game not found or no prediction yet" })
  async getGamePrediction(@Param("id") id: string) {
    const game = await this.gamesService.getGameById(id);
    if (!game) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }

    const { prediction } = game;
    if (!prediction) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No prediction has been generated for this game yet — run predict_games.py in apps/predictor."
      );
    }
    return prediction;
  }

  // GET /v1/games/:id/prediction/history — every model version's
  // prediction ever produced for this game, oldest first. The
  // reproducibility half of model versioning: :id/prediction above always
  // reflects the latest model run, so this is how a caller sees what the
  // game was predicted to be under a version that's since been superseded.
  // Empty array, not 404, when the game exists but has no prediction runs
  // yet — a collection endpoint, same convention as GET /v1/games.
  @Get(":id/prediction/history")
  @ApiOperation({ summary: "Get every model version's prediction for this game" })
  @ApiParam({ name: "id", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Prediction history, oldest first" })
  @ApiResponse({ status: 404, description: "Game not found" })
  async getGamePredictionHistory(@Param("id") id: string) {
    const game = await this.gamesService.getGameById(id);
    if (!game) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }
    return this.gamesService.getPredictionHistoryForGame(id);
  }

  // GET /v1/games/:id/events — this game's raw, ordered play-by-play (see
  // apps/ingestion/play_by_play.py), the record every derived stat this
  // platform publishes ultimately traces back to
  // (apps/ingestion/derive_player_game_stats.py). Paginated: a completed
  // game can carry several hundred events. Empty page, not 404, for a
  // game with no events yet — same collection convention as
  // :id/prediction/history; only the game itself missing 404s.
  @Get(":id/events")
  @ApiOperation({ summary: "Get a game's ordered play-by-play events" })
  @ApiParam({ name: "id", description: "Game UUID" })
  @ApiResponse({ status: 200, description: "Paginated game events" })
  @ApiResponse({ status: 404, description: "Game not found" })
  async getGameEvents(@Param("id") id: string, @Query() query: Record<string, unknown>) {
    const game = await this.gamesService.getGameById(id);
    if (!game) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }
    const { page, pageSize } = parsePageParams(query);
    return this.gamesService.getGameEvents(id, page, pageSize);
  }
}
