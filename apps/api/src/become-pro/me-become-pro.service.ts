import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type CompetitionLevel, type ProspectGame } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { findBlockingProblems } from "./prospect-box-score.js";
import { ProspectValuationService } from "./prospect-valuation.service.js";

// Bounds that exist to stop one account filling the table rather than to
// express a rule about basketball. A season is at most an NBA-length schedule
// plus playoffs; nobody has played more than a handful of countable seasons
// by the time they are a prospect.
const MAX_SEASONS_PER_USER = 12;
const MAX_GAMES_PER_SEASON = 120;

export interface CreateSeasonInput {
  season: string;
  competitionLevel: CompetitionLevel;
  position: string;
  teamName?: string | null;
}

export type GameInput = Omit<ProspectGame, "id" | "seasonId" | "createdAt" | "updatedAt">;

/**
 * Everything the signed-in user can change about their own Become Pro data.
 *
 * Every method takes the caller's userId and every row it touches is reached
 * THROUGH that id. A season id or a game id is never sufficient on its own —
 * that is the security boundary for this resource, the same one
 * SavedComparisonsService draws.
 *
 * Every write that can move the projected value re-values the season before
 * returning, so the figure on the page is current the moment the request
 * completes — the reason valuation lives in the API at all.
 */
@Injectable()
export class MeBecomeProService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valuationService: ProspectValuationService
  ) {}

  async createSeason(userId: string, input: CreateSeasonInput) {
    const existingCount = await this.prisma.prospectSeason.count({ where: { userId } });
    if (existingCount >= MAX_SEASONS_PER_USER) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "SEASON_LIMIT_REACHED",
        `You can log at most ${MAX_SEASONS_PER_USER} seasons`
      );
    }

    try {
      return await this.prisma.prospectSeason.create({
        data: {
          userId,
          season: input.season,
          competitionLevel: input.competitionLevel,
          position: input.position,
          teamName: input.teamName ?? null,
        },
      });
    } catch (error) {
      // The unique index on (userId, season) is what turns logging the same
      // league year twice into a 409 rather than a silently split game log.
      if (isUniqueViolation(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "SEASON_ALREADY_EXISTS",
          `You have already logged a ${input.season} season`
        );
      }
      throw error;
    }
  }

  async updateSeason(userId: string, seasonId: string, input: Partial<CreateSeasonInput>) {
    await this.assertOwnsSeason(userId, seasonId);
    try {
      const season = await this.prisma.prospectSeason.update({
        where: { id: seasonId },
        data: {
          ...(input.season !== undefined ? { season: input.season } : {}),
          ...(input.competitionLevel !== undefined ? { competitionLevel: input.competitionLevel } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.teamName !== undefined ? { teamName: input.teamName } : {}),
        },
      });
      // A changed competition level changes the level factor, which moves the
      // figure; re-valuing unconditionally is cheap and cannot be forgotten
      // when another field starts to matter too.
      await this.valuationService.revalueSeason(seasonId);
      return season;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "SEASON_ALREADY_EXISTS",
          `You have already logged a ${input.season} season`
        );
      }
      throw error;
    }
  }

  async deleteSeason(userId: string, seasonId: string): Promise<{ deleted: true }> {
    await this.assertOwnsSeason(userId, seasonId);
    // Games and valuations go with it via ON DELETE CASCADE.
    await this.prisma.prospectSeason.delete({ where: { id: seasonId } });
    return { deleted: true };
  }

  async addGame(userId: string, seasonId: string, input: GameInput) {
    await this.assertOwnsSeason(userId, seasonId);

    const gameCount = await this.prisma.prospectGame.count({ where: { seasonId } });
    if (gameCount >= MAX_GAMES_PER_SEASON) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "GAME_LIMIT_REACHED",
        `A season can hold at most ${MAX_GAMES_PER_SEASON} games`
      );
    }

    this.assertBoxScoreIsPossible(input);

    try {
      const game = await this.prisma.prospectGame.create({ data: { ...input, seasonId } });
      await this.valuationService.revalueSeason(seasonId);
      return game;
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateGame();
      throw error;
    }
  }

  async updateGame(userId: string, gameId: string, input: Partial<GameInput>) {
    const existing = await this.prisma.prospectGame.findFirst({
      where: { id: gameId, season: { userId } },
    });
    if (!existing) {
      throw new ApiException(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND", "No such game");
    }

    // Checked against the MERGED row, not the patch alone: raising makes on
    // their own can break a line whose attempts were never touched.
    this.assertBoxScoreIsPossible({ ...existing, ...input });

    try {
      const game = await this.prisma.prospectGame.update({ where: { id: gameId }, data: input });
      await this.valuationService.revalueSeason(existing.seasonId);
      return game;
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateGame();
      throw error;
    }
  }

  async deleteGame(userId: string, gameId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.prospectGame.findFirst({
      where: { id: gameId, season: { userId } },
      select: { id: true, seasonId: true },
    });
    if (!existing) {
      throw new ApiException(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND", "No such game");
    }

    await this.prisma.prospectGame.delete({ where: { id: gameId } });
    // Dropping back under the games floor has to clear the figure too, which
    // revalueSeason handles.
    await this.valuationService.revalueSeason(existing.seasonId);
    return { deleted: true };
  }

  private async assertOwnsSeason(userId: string, seasonId: string): Promise<void> {
    const season = await this.prisma.prospectSeason.findFirst({
      where: { id: seasonId, userId },
      select: { id: true },
    });
    if (!season) {
      // 404 rather than 403 on purpose: a season the caller does not own must
      // not be distinguishable from one that does not exist, or the error
      // itself leaks which ids are real.
      throw new ApiException(HttpStatus.NOT_FOUND, "SEASON_NOT_FOUND", "No such season");
    }
  }

  private assertBoxScoreIsPossible(game: Omit<GameInput, "gameDate"> & { gameDate: Date }): void {
    const problems = findBlockingProblems(game);
    if (problems.length > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_BOX_SCORE",
        `That box score cannot be right: ${problems.join("; ")}`
      );
    }
  }
}

function duplicateGame(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    "DUPLICATE_GAME",
    "A game against that opponent on that date is already logged"
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
