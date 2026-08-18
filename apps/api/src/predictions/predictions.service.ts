import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PredictionsService {
  constructor(private readonly prisma: PrismaService) {}

  // The prediction for one specific game — written by apps/predictor's
  // predict_games.py, never by NestJS. Returns null if that script hasn't
  // been run yet (or hasn't covered this game), same null-then-404-at-the-
  // controller pattern as OptimizerService.getLatestLineup.
  getPredictionForGame(gameId: string) {
    return this.prisma.gamePrediction.findUnique({ where: { gameId } });
  }
}
