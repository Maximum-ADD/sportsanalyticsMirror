import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type CompetitionLevel, type ProspectGame } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BecomeProService } from "./become-pro.service.js";
import { EvidenceStorageService } from "./evidence-storage.service.js";
import { findBlockingProblems } from "./prospect-box-score.js";

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
  isPublic?: boolean;
}

export type GameInput = Omit<ProspectGame, "id" | "seasonId" | "evidenceId" | "createdAt" | "updatedAt">;

/**
 * Everything the signed-in user can change about their own Become Pro data.
 *
 * Every method takes the caller's userId and every row it touches is reached
 * THROUGH that id. A season id, a game id or an evidence id is never
 * sufficient on its own — that is the security boundary for this resource,
 * the same one SavedComparisonsService draws.
 */
@Injectable()
export class MeBecomeProService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly becomeProService: BecomeProService,
    private readonly evidenceStorage: EvidenceStorageService
  ) {}

  async createSeason(userId: string, input: CreateSeasonInput) {
    await this.assertUsername(userId);

    const existingCount = await this.prisma.prospectSeason.count({ where: { userId } });
    if (existingCount >= MAX_SEASONS_PER_USER) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "SEASON_LIMIT_REACHED",
        `A prospect can log at most ${MAX_SEASONS_PER_USER} seasons`
      );
    }

    try {
      const season = await this.prisma.prospectSeason.create({
        data: {
          userId,
          season: input.season,
          competitionLevel: input.competitionLevel,
          position: input.position,
          teamName: input.teamName ?? null,
          isPublic: input.isPublic ?? true,
        },
      });
      this.becomeProService.invalidate();
      return season;
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
    const season = await this.prisma.prospectSeason.update({
      where: { id: seasonId },
      data: {
        ...(input.season !== undefined ? { season: input.season } : {}),
        ...(input.competitionLevel !== undefined ? { competitionLevel: input.competitionLevel } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.teamName !== undefined ? { teamName: input.teamName } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      },
    });
    this.becomeProService.invalidate();
    return season;
  }

  async deleteSeason(userId: string, seasonId: string): Promise<{ deleted: true }> {
    await this.assertOwnsSeason(userId, seasonId);

    // Evidence objects are removed from Storage first, then the rows go with
    // the season via ON DELETE CASCADE. Doing it in this order means a failed
    // delete leaves an orphaned FILE rather than an orphaned ROW pointing at
    // a file that is gone.
    const evidence = await this.prisma.prospectEvidence.findMany({ where: { seasonId } });
    await Promise.all(
      evidence.map((document) => this.evidenceStorage.deleteObjectBestEffort(document.objectPath))
    );

    await this.prisma.prospectSeason.delete({ where: { id: seasonId } });
    this.becomeProService.invalidate();
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
      this.becomeProService.invalidate();
      return game;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "DUPLICATE_GAME",
          "A game against that opponent on that date is already logged"
        );
      }
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

    const merged = { ...existing, ...input };
    this.assertBoxScoreIsPossible(merged);

    try {
      const game = await this.prisma.prospectGame.update({
        where: { id: gameId },
        data: {
          ...input,
          // Editing the numbers clears the verification: a document that was
          // checked against the old line does not vouch for the new one.
          // Without this, reliability is farmable — log a modest game, get it
          // verified, then edit the figures upward and keep the credit.
          evidenceId: null,
        },
      });
      this.becomeProService.invalidate();
      return game;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "DUPLICATE_GAME",
          "A game against that opponent on that date is already logged"
        );
      }
      throw error;
    }
  }

  async deleteGame(userId: string, gameId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.prospectGame.findFirst({
      where: { id: gameId, season: { userId } },
      select: { id: true },
    });
    if (!existing) {
      throw new ApiException(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND", "No such game");
    }

    await this.prisma.prospectGame.delete({ where: { id: gameId } });
    this.becomeProService.invalidate();
    return { deleted: true };
  }

  /**
   * Stores one uploaded document and attaches it to the games it covers.
   *
   * @param gameIds - the games this document vouches for, or undefined with
   *                  `wholeSeason` to cover every game currently logged.
   *
   * "Whole season" resolves to the games that exist AT UPLOAD TIME rather
   * than staying open-ended: a document cannot vouch for a game logged after
   * it was written, and leaving the link implicit would let somebody upload
   * one sheet and then add games under its cover indefinitely.
   */
  async addEvidence(
    userId: string,
    seasonId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    options: { gameIds?: string[]; wholeSeason?: boolean }
  ) {
    await this.assertOwnsSeason(userId, seasonId);

    const objectPath = await this.evidenceStorage.uploadEvidence(userId, seasonId, file);

    const evidence = await this.prisma.prospectEvidence.create({
      data: {
        seasonId,
        fileName: file.originalname,
        objectPath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    const coveredGameIds = options.wholeSeason
      ? (await this.prisma.prospectGame.findMany({ where: { seasonId }, select: { id: true } })).map(
          (game) => game.id
        )
      : (options.gameIds ?? []);

    if (coveredGameIds.length > 0) {
      await this.prisma.prospectGame.updateMany({
        // Scoped to this season as well as the ids: a caller must not be able
        // to attach their document to somebody else's game by id.
        where: { id: { in: coveredGameIds }, seasonId },
        data: { evidenceId: evidence.id },
      });
    }

    this.becomeProService.invalidate();
    return evidence;
  }

  async deleteEvidence(userId: string, evidenceId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.prospectEvidence.findFirst({
      where: { id: evidenceId, season: { userId } },
    });
    if (!existing) {
      throw new ApiException(HttpStatus.NOT_FOUND, "EVIDENCE_NOT_FOUND", "No such document");
    }

    await this.evidenceStorage.deleteObjectBestEffort(existing.objectPath);
    // The games it covered survive with evidenceId set to null by the
    // schema's ON DELETE SET NULL — deleting a scoresheet stops it vouching
    // for games, it does not delete them.
    await this.prisma.prospectEvidence.delete({ where: { id: evidenceId } });
    this.becomeProService.invalidate();
    return { deleted: true };
  }

  // ── guards ──────────────────────────────────────────────────────────────

  // A prospect is identified on the board by username, so an account that has
  // not finished onboarding cannot be ranked. Refusing the write is kinder
  // than accepting data the board can never key on.
  private async assertUsername(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user?.username) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "USERNAME_REQUIRED",
        "Set a username before logging a season — the board lists prospects by username"
      );
    }
  }

  private async assertOwnsSeason(userId: string, seasonId: string): Promise<void> {
    const season = await this.prisma.prospectSeason.findFirst({
      where: { id: seasonId, userId },
      select: { id: true },
    });
    if (!season) {
      // 404 rather than 403 on purpose: a season the caller does not own
      // should not be distinguishable from one that does not exist, or the
      // error itself leaks which ids are real.
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
