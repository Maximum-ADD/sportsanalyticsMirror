import { Injectable } from "@nestjs/common";
import type { SeasonType } from "@prisma/client";
import { PUBLISHED_GAME_FILTER } from "../common/game-visibility.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { evaluateStatisticExpression } from "./expression-evaluator.js";
import { validateStatisticExpression } from "./expression-validator.js";

const CALCULABLE_STATISTIC_FIELDS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers", "minutes"] as const;
const FIRST_VERSION = 1;
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

  /**
   * Creates a statistic at version 1, recording that first expression in its
   * version history in the same write.
   *
   * @throws Error, synchronously, when the expression fails validation; nothing is written.
   */
  createDefinition(authorId: string, name: string, expression: string) {
    validateStatisticExpression(expression);
    return this.prisma.customStatistic.create({
      data: { authorId, name, expression, versions: { create: { version: FIRST_VERSION, expression } } },
    });
  }

  /**
   * Replaces a statistic's expression as a new version. The bump and the
   * history row commit together, so the history never skips or repeats a
   * version, and the previous expression stays evaluable by its number.
   *
   * @throws Error, synchronously, when the expression fails validation; nothing is written.
   */
  updateDefinition(authorId: string, definitionId: string, expression: string) {
    validateStatisticExpression(expression);
    return this.prisma.$transaction(async (transaction) => {
      const updatedDefinition = await transaction.customStatistic.update({
        where: { id: definitionId, authorId },
        data: { expression, version: { increment: 1 } },
      });
      await transaction.customStatisticVersion.create({
        data: { statisticId: updatedDefinition.id, version: updatedDefinition.version, expression },
      });
      return updatedDefinition;
    });
  }

  /**
   * Every version of one of the author's statistics, oldest first.
   *
   * @returns the history, or null when the statistic doesn't exist or isn't the caller's.
   */
  async listVersions(authorId: string, definitionId: string) {
    const definition = await this.prisma.customStatistic.findFirst({
      where: { id: definitionId, authorId },
      select: { versions: { orderBy: { version: "asc" }, select: { version: true, expression: true, createdAt: true } } },
    });
    return definition?.versions ?? null;
  }

  /**
   * Evaluates one of the author's statistics for a player, from the
   * player's per-game averages over published games.
   *
   * @param version - which version's expression to evaluate; omit for the
   *   current one. Asking for an earlier version reproduces a figure
   *   published before the formula was edited.
   * @returns the value with the version and expression that produced it, or
   *   null when the statistic (or that version of it) doesn't exist or isn't
   *   the caller's.
   */
  async calculateDefinition(
    authorId: string,
    definitionId: string,
    playerId: string,
    seasonType?: SeasonType,
    version?: number,
  ) {
    const definition = await this.prisma.customStatistic.findFirst({ where: { id: definitionId, authorId } });
    if (!definition) return null;
    const evaluatedVersion = await this.findVersionToEvaluate(definition, version);
    if (!evaluatedVersion) return null;

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
      version: evaluatedVersion.version,
      expression: evaluatedVersion.expression,
      playerId,
      gamesCount: gameStats.length,
      value: evaluateStatisticExpression(evaluatedVersion.expression, statisticValues),
    };
  }

  // The current version needs no history lookup; any other is read from it.
  private async findVersionToEvaluate(
    definition: { id: string; version: number; expression: string },
    requestedVersion?: number,
  ): Promise<{ version: number; expression: string } | null> {
    if (requestedVersion === undefined || requestedVersion === definition.version) {
      return { version: definition.version, expression: definition.expression };
    }
    return this.prisma.customStatisticVersion.findUnique({
      where: { statisticId_version: { statisticId: definition.id, version: requestedVersion } },
      select: { version: true, expression: true },
    });
  }
}
