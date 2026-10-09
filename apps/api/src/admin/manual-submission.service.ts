import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { deriveGameEventStats, type DerivableGameEvent, type PlayerName } from "./derive-player-game-stats.js";
import {
  parseManualSubmissionBody,
  validateSubmittedEvents,
  type ManualSubmissionRequest,
  type SubmissionContext,
} from "./manual-submission-request.js";

export const MANUAL_SUBMISSION_SOURCE = "human";

export interface SubmittedBatchSummary {
  batchId: string;
  status: "PENDING_REVIEW";
  eventsAccepted: number;
  playersWithStats: number;
}

@Injectable()
export class ManualSubmissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accepts one human-typed game's worth of play-by-play, validates it
   * against the platform's own event schema (the same rules a correction
   * is held to, plus sequence ordering a correction never needs), and
   * writes it as a new IngestionBatch landing PENDING_REVIEW — exactly
   * where the automated pipeline's --review runs land, so a human
   * submission goes through the same admin approval gate rather than a
   * second, looser path into GameEvent.
   *
   * Only usable on a game with no existing events: this is a fresh
   * submission, not a correction (AdminEventsService.correctEvent already
   * owns editing a single already-ingested play). A game the pipeline
   * hasn't reached yet — most of them, going by how far behind play-by-
   * play backfill runs — is exactly the gap this closes.
   *
   * @throws ApiException 404 when the game doesn't exist, 409 when it
   *   already has events (including when a concurrent submission for the
   *   same game won the race to write first), 400 when the submission
   *   fails validation.
   */
  async submitGameEvents(gameId: string, submitterId: string, rawBody: unknown): Promise<SubmittedBatchSummary> {
    const request = this.parseBody(rawBody);
    const game = await this.loadGameForSubmission(gameId);
    const context = await this.buildSubmissionContext(game);

    const errors = validateSubmittedEvents(request.events, context);
    this.checkMinutesCoverage(request, errors);
    if (errors.length > 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", errors.join("; "));
    }

    try {
      return await this.writeBatch(gameId, submitterId, request, context);
    } catch (error) {
      // GameEvent's own (gameId, sequence) unique constraint is what
      // actually stops two concurrent submissions from both landing: the
      // in-transaction recheck in writeBatch closes the common case, but
      // READ COMMITTED (Postgres's default) does not serialize two
      // transactions that both start before either commits, so the
      // constraint is the backstop that makes the race impossible to win
      // for both writers. Translated into the same 409 a non-concurrent
      // double submission gets, rather than a raw 500.
      if (isUniqueConstraintError(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "CONFLICT",
          "This game already has events — submit a correction instead of a new batch",
        );
      }
      throw error;
    }
  }

  private parseBody(rawBody: unknown): ManualSubmissionRequest {
    try {
      return parseManualSubmissionBody(rawBody);
    } catch (error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", (error as Error).message);
    }
  }

  // Only confirms the game exists and loads its team ids — NOT whether it
  // already has events. That check is re-run inside writeBatch's own
  // transaction, immediately before the writes: checking it here as a
  // separate, earlier query would leave a window where two submissions for
  // the same empty game (an automated pull and a human submission, or two
  // human submissions) could both pass this check before either had
  // written anything, and both then try to create a batch for a game that,
  // by the time either commits, already has events.
  private async loadGameForSubmission(gameId: string): Promise<{ id: string; homeTeamId: string; awayTeamId: string }> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, homeTeamId: true, awayTeamId: true },
    });
    if (!game) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Game not found");
    }
    return game;
  }

  // A fresh submission has no stat rows yet to resolve rosters from the
  // way a correction does (game-snapshot.ts's resolveGameTeamByPlayerId) —
  // built from each team's CURRENT roster instead, the best source
  // available before this game has a box score of its own.
  private async buildSubmissionContext(game: { homeTeamId: string; awayTeamId: string }): Promise<SubmissionContext> {
    const rosterPlayers = await this.prisma.player.findMany({
      where: { teamId: { in: [game.homeTeamId, game.awayTeamId] } },
      select: { id: true, teamId: true },
    });
    const teamIdByPlayerId = new Map(
      rosterPlayers.filter((player) => player.teamId !== null).map((player) => [player.id, player.teamId as string]),
    );
    return { homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, teamIdByPlayerId };
  }

  // Every player who acts in the submitted events needs minutes supplied —
  // see ManualSubmissionRequest's own doc comment for why this can't be
  // derived from the events the way the counting stats are.
  private checkMinutesCoverage(request: ManualSubmissionRequest, errors: string[]): void {
    const actingPlayerIds = new Set(request.events.map((event) => event.playerId).filter((id): id is string => id !== null));
    for (const playerId of actingPlayerIds) {
      if (!(playerId in request.minutesByPlayerId)) {
        errors.push(`playerId ${playerId} has an event but no entry in minutesByPlayerId`);
      }
    }
  }

  private async writeBatch(
    gameId: string,
    submitterId: string,
    request: ManualSubmissionRequest,
    context: SubmissionContext,
  ): Promise<SubmittedBatchSummary> {
    const playerIds = Object.keys(request.minutesByPlayerId);
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const namesByPlayerId = new Map<string, PlayerName>(
      players.map((player) => [player.id, { firstName: player.firstName, lastName: player.lastName }]),
    );

    const derivableEvents: DerivableGameEvent[] = request.events.map((event) => ({
      eventType: event.eventType,
      subType: event.subType,
      playerId: event.playerId,
      teamId: event.teamId,
      success: event.success,
      value: event.value,
      description: event.description,
    }));
    const derivedStatsByPlayerId = deriveGameEventStats(derivableEvents, namesByPlayerId);

    return this.prisma.$transaction(async (transaction) => {
      // Re-checked here, inside the transaction, rather than trusting the
      // same check loadGameForSubmission already ran: two submissions for
      // the same empty game (another human, or the automated pipeline)
      // could both have passed that earlier check before either reached
      // this point. GameEvent's own (gameId, sequence) unique constraint
      // would reject the losing createMany below regardless, but that
      // surfaces as an opaque unique-constraint error — this turns the
      // same race into the same clean 409 a non-concurrent double
      // submission gets.
      const existingEventCount = await transaction.gameEvent.count({ where: { gameId } });
      if (existingEventCount > 0) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "CONFLICT",
          "This game already has events — submit a correction instead of a new batch",
        );
      }

      const batch = await transaction.ingestionBatch.create({
        data: {
          gameId,
          source: MANUAL_SUBMISSION_SOURCE,
          status: "PENDING_REVIEW",
          submittedById: submitterId,
          eventsAccepted: request.events.length,
          eventsRejected: 0,
          completedAt: new Date(),
        },
      });

      await transaction.gameEvent.createMany({
        data: request.events.map((event) => ({
          gameId,
          batchId: batch.id,
          sequence: event.sequence,
          period: event.period,
          clock: event.clock,
          eventType: event.eventType,
          subType: event.subType,
          playerId: event.playerId,
          teamId: event.teamId,
          success: event.success,
          value: event.value,
          description: event.description,
        })),
      });

      // One stat row per player who was given minutes — including a
      // player who sat the whole game scoreless, not just those who
      // appear in derivedStatsByPlayerId (a DNP-with-zero-plays entry is
      // still a legitimate box-score row, same as the ingestion pipeline
      // writes for every rostered player BoxScoreTraditionalV3 lists).
      await transaction.playerGameStat.createMany({
        data: Object.entries(request.minutesByPlayerId).map(([playerId, minutes]) => {
          const derived = derivedStatsByPlayerId.get(playerId);
          return {
            playerId,
            gameId,
            teamId: context.teamIdByPlayerId.get(playerId) ?? null,
            minutes,
            points: derived?.points ?? 0,
            rebounds: derived?.rebounds ?? 0,
            assists: derived?.assists ?? 0,
            steals: derived?.steals ?? 0,
            blocks: derived?.blocks ?? 0,
            turnovers: derived?.turnovers ?? 0,
            fieldGoalsMade: derived?.fieldGoalsMade ?? 0,
            fieldGoalsAttempted: derived?.fieldGoalsAttempted ?? 0,
            threesMade: derived?.threesMade ?? 0,
            threesAttempted: derived?.threesAttempted ?? 0,
            freeThrowsMade: derived?.freeThrowsMade ?? 0,
            freeThrowsAttempted: derived?.freeThrowsAttempted ?? 0,
            offensiveRebounds: derived?.offensiveRebounds ?? 0,
            defensiveRebounds: derived?.defensiveRebounds ?? 0,
          };
        }),
      });

      return {
        batchId: batch.id,
        status: "PENDING_REVIEW" as const,
        eventsAccepted: request.events.length,
        playersWithStats: playerIds.length,
      };
    });
  }
}

// Prisma throws a PrismaClientKnownRequestError with code "P2002" for a
// unique constraint violation. Narrow-checked structurally (duck-typed)
// rather than importing the Prisma error class, matching me-api-keys
// .service.ts and MeController's own identical check.
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
