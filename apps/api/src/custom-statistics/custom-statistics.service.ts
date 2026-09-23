import { Injectable } from "@nestjs/common";
import type { SeasonType } from "@prisma/client";
import { PUBLISHED_GAME_FILTER } from "../common/game-visibility.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { evaluateStatisticExpression } from "./expression-evaluator.js";
import { validateStatisticExpression } from "./expression-validator.js";

const CALCULABLE_STATISTIC_FIELDS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers", "minutes"] as const;
type CalculableStatisticField = (typeof CALCULABLE_STATISTIC_FIELDS)[number];

function calculatePerGameAverages(gameStats: Array<Record<CalculableStatisticField, number>>): Map<string, number> {
  const gameCount = gameStats.length;
  const totals = new Map<string, number>(CALCULABLE_STATISTIC_FIELDS.map((field) => [field, 0]));
  for (const gameStat of gameStats) {
    for (const field of CALCULABLE_STATISTIC_FIELDS) totals.set(field, totals.get(field)! + gameStat[field]);
  }
  return new Map(CALCULABLE_STATISTIC_FIELDS.map((field) => [field, gameCount === 0 ? 0 : totals.get(field)! / gameCount]));
}

@Injectable()
export class CustomStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  listDefinitions(authorId: string) {
    return this.prisma.customStatistic.findMany({ where: { authorId }, orderBy: { updatedAt: "desc" } });
  }

  createDefinition(authorId: string, name: string, expression: string) {
    validateStatisticExpression(expression);
    return this.prisma.customStatistic.create({ data: { authorId, name, expression } });
  }

  updateDefinition(authorId: string, definitionId: string, expression: string) {
    validateStatisticExpression(expression);
    return this.prisma.customStatistic.update({
      where: { id: definitionId, authorId },
      data: { expression, version: { increment: 1 } },
    });
  }

  async calculateDefinition(authorId: string, definitionId: string, playerId: string, seasonType?: SeasonType) {
    const definition = await this.prisma.customStatistic.findFirst({ where: { id: definitionId, authorId } });
    if (!definition) return null;

    const gameStats = await this.prisma.playerGameStat.findMany({
      where: { playerId, game: { ...(seasonType ? { seasonType } : {}), ...PUBLISHED_GAME_FILTER } },
      select: {
        points: true,
        rebounds: true,
        assists: true,
        steals: true,
        blocks: true,
        turnovers: true,
        minutes: true,
      },
    });
    const statisticValues = calculatePerGameAverages(gameStats);
    return {
      definitionId: definition.id,
      name: definition.name,
      version: definition.version,
      playerId,
      gamesCount: gameStats.length,
      value: evaluateStatisticExpression(definition.expression, statisticValues),
    };
  }
}
