import { Controller, Get } from "@nestjs/common";
import { EvaluatedGamesService } from "./evaluated-games.service.js";
import { LeaderboardService, type Leaderboard } from "./leaderboard.service.js";
import { ModelAccuracyService, type ModelAccuracyReport } from "./model-accuracy.service.js";

@Controller("v1/analytics")
export class AnalyticsController {
  constructor(
    private readonly evaluatedGamesService: EvaluatedGamesService,
    private readonly modelAccuracyService: ModelAccuracyService,
    private readonly leaderboardService: LeaderboardService
  ) {}

  // GET /v1/analytics/model-accuracy — how the Elo model has actually scored
  // on games that are both finished and predicted. Deliberately public and
  // unguarded: it describes the model, not a user, so it is identical for
  // every account and for signed-out visitors. Not paginated either — it is
  // a fixed-size summary, not a list.
  @Get("model-accuracy")
  async getModelAccuracy(): Promise<ModelAccuracyReport> {
    const evaluatedGames = await this.evaluatedGamesService.getEvaluatedGames();
    return this.modelAccuracyService.buildAccuracyReport(evaluatedGames);
  }

  // GET /v1/analytics/leaderboard — who is calling games most accurately,
  // with the model on the board as the benchmark rather than as a rival.
  //
  // Public, like the accuracy ledger above: a leaderboard nobody can see
  // until they sign in is not a leaderboard, and it is the same figures for
  // every viewer. That does mean a signed-out visitor can read the display
  // names of people who have played — a deliberate choice for a leaderboard,
  // and a one-line reversal (@UseGuards(SessionAuthGuard)) if the team would
  // rather it were private. Only User.name is ever selected; see
  // LeaderboardService.readDisplayNames.
  @Get("leaderboard")
  async getLeaderboard(): Promise<Leaderboard> {
    const evaluatedGames = await this.evaluatedGamesService.getEvaluatedGames();
    return this.leaderboardService.getLeaderboard(evaluatedGames);
  }
}
