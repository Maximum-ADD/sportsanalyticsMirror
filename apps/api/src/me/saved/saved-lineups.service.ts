import { HttpStatus, Injectable } from "@nestjs/common";
import type { PlayerPrediction } from "@prisma/client";
import { ApiException } from "../../common/api-exception.js";
import type { PageParams, PagedResult } from "../../common/pagination.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { deriveLineupDrift, type LineupDrift, type SavedSlotValuation } from "./lineup-drift.js";

// Slots carry the player (and their team) so the shelf can render a saved
// lineup without a lookup per slot, exactly as /v1/optimizer/lineup does.
const savedLineupInclude = {
  slots: { include: { player: { include: { team: true } } } },
} as const;

/**
 * Rejects the save unless every slot in the source lineup can be valued.
 *
 * @param slots - the source Lineup's slots.
 * @param latestPredictionByPlayerId - the newest PlayerPrediction per player.
 * @throws ApiException 409 CONFLICT naming the players that cannot be priced.
 *
 * A slot whose player has no prediction used to freeze at 0 points / $0
 * salary. That looks harmless and is not: drift is measured as
 * latest-minus-frozen, so the next optimizer run that does price the player
 * reports a fabricated jump of their entire value — movement the data never
 * showed. It also contradicted this module's own read side, where
 * lineup-drift.ts refuses exactly that substitution for exactly that reason.
 *
 * Zero is not what the pipeline says about an unpredicted player; it says
 * nothing at all. Refusing the snapshot is the only answer that neither
 * invents a number nor silently stores one.
 */
function requireEveryPlayerIsPriced(
  slots: readonly { playerId: string }[],
  latestPredictionByPlayerId: Map<string, PlayerPrediction>
): void {
  const unpricedPlayerIds = slots
    .filter((slot) => !latestPredictionByPlayerId.has(slot.playerId))
    .map((slot) => slot.playerId);

  if (unpricedPlayerIds.length > 0) {
    throw new ApiException(
      HttpStatus.CONFLICT,
      "CONFLICT",
      `This lineup cannot be saved yet: no current prediction exists for ${unpricedPlayerIds.join(", ")}. Re-run the optimizer's predict step and try again.`
    );
  }
}

@Injectable()
export class SavedLineupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads one page of the user's saved lineups, newest first, each annotated
   * with how far it has drifted from the numbers it was saved with.
   *
   * @param userId - the signed-in user; other users' lineups are invisible.
   * @param pageParams - already-clamped page/pageSize from parsePageParams().
   * @returns the pagination envelope; each entry is the saved lineup, its slots
   *          (with the frozen predictedPointsAtSave/salaryAtSave), and
   *          `drift: { pointsDelta, salaryDelta, isOverBudget }` as latest minus saved.
   */
  async getSavedLineups(userId: string, pageParams: PageParams): Promise<PagedResult<unknown>> {
    const where = { userId };
    const [savedLineups, total] = await Promise.all([
      this.prisma.savedLineup.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageParams.page - 1) * pageParams.pageSize,
        take: pageParams.pageSize,
        include: savedLineupInclude,
      }),
      this.prisma.savedLineup.count({ where }),
    ]);

    const savedPlayerIds = savedLineups.flatMap((savedLineup) => savedLineup.slots.map((slot) => slot.playerId));
    const latestPredictionByPlayerId = await this.getLatestPredictionsByPlayerId(savedPlayerIds);

    const data = savedLineups.map((savedLineup) => ({
      ...savedLineup,
      drift: this.deriveDriftFor(savedLineup.slots, savedLineup.budgetAtSave, latestPredictionByPlayerId),
    }));
    return { data, page: pageParams.page, pageSize: pageParams.pageSize, total };
  }

  /**
   * Snapshots the current global Lineup named by `sourceLineupId` into a
   * SavedLineup owned by the caller.
   *
   * Each slot freezes the player's prediction as it stands right now.
   * PlayerPrediction is append-and-take-latest, so nothing here can be
   * re-derived later: the next optimizer run adds newer rows and the frozen
   * values are the only surviving record of what the user actually saved —
   * and the only thing drift can be measured against.
   *
   * @param userId - the owner of the new snapshot.
   * @param name - the user's label for the saved lineup.
   * @param sourceLineupId - the global Lineup to copy; it is referenced by id only
   *                         (SavedLineup.sourceLineupId), never joined back to on read,
   *                         so a later optimizer run cannot rewrite this snapshot.
   * @returns the created saved lineup with its slots resolved, and zero drift by construction.
   * @throws ApiException 404 NOT_FOUND when the source lineup does not exist.
   */
  async createSavedLineup(userId: string, name: string, sourceLineupId: string) {
    const sourceLineup = await this.prisma.lineup.findUnique({
      where: { id: sourceLineupId },
      include: { slots: true },
    });
    if (!sourceLineup) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Lineup not found");
    }

    const latestPredictionByPlayerId = await this.getLatestPredictionsByPlayerId(
      sourceLineup.slots.map((slot) => slot.playerId)
    );
    requireEveryPlayerIsPriced(sourceLineup.slots, latestPredictionByPlayerId);

    return this.prisma.savedLineup.create({
      data: {
        userId,
        name,
        sourceLineupId: sourceLineup.id,
        // The lineup-level totals are copied from the source rather than
        // re-summed: they are what the optimizer produced and what the user was
        // looking at on screen when they hit save.
        totalPredictedPointsAtSave: sourceLineup.totalPredictedPoints,
        totalSalaryAtSave: sourceLineup.totalSalary,
        budgetAtSave: sourceLineup.budget,
        slots: {
          // Non-null by construction: requireEveryPlayerIsPriced above has
          // already rejected the save if any slot could not be valued.
          create: sourceLineup.slots.map((slot) => ({
            playerId: slot.playerId,
            predictedPointsAtSave: latestPredictionByPlayerId.get(slot.playerId)!.predictedFantasyPoints,
            salaryAtSave: latestPredictionByPlayerId.get(slot.playerId)!.salary,
          })),
        },
      },
      include: savedLineupInclude,
    });
  }

  /**
   * Deletes one of the caller's saved lineups; its SavedLineupSlot rows go with
   * it via ON DELETE CASCADE. The source Lineup is untouched.
   *
   * @param userId - the signed-in user; another user's row is treated as absent.
   * @param savedLineupId - the row to delete.
   * @throws ApiException 404 NOT_FOUND when no row matches BOTH the id and the owner.
   */
  async deleteSavedLineup(userId: string, savedLineupId: string): Promise<void> {
    // Ownership is part of the delete predicate, so another user's id is
    // indistinguishable from a nonexistent one — see the matching note in
    // SavedComparisonsService.
    const { count } = await this.prisma.savedLineup.deleteMany({
      where: { id: savedLineupId, userId },
    });
    if (count === 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Saved lineup not found");
    }
  }

  // Pairs each frozen slot with the player's current prediction and hands the
  // subtraction to the pure drift module.
  private deriveDriftFor(
    slots: { playerId: string; predictedPointsAtSave: number; salaryAtSave: number }[],
    budgetAtSave: number,
    latestPredictionByPlayerId: Map<string, PlayerPrediction>
  ): LineupDrift {
    const valuations: SavedSlotValuation[] = slots.map((slot) => ({
      playerId: slot.playerId,
      predictedPointsAtSave: slot.predictedPointsAtSave,
      salaryAtSave: slot.salaryAtSave,
      latestPredictedFantasyPoints:
        latestPredictionByPlayerId.get(slot.playerId)?.predictedFantasyPoints ?? null,
      latestSalary: latestPredictionByPlayerId.get(slot.playerId)?.salary ?? null,
    }));
    return deriveLineupDrift(valuations, budgetAtSave);
  }

  // "Latest prediction per player" means newest asOf, one row per player —
  // the same orderBy/distinct pair OptimizerService.getLatestLineup() uses to
  // price a lineup. Any other tie-break here would make drift disagree with
  // the numbers the optimizer page shows for the very same players.
  private async getLatestPredictionsByPlayerId(playerIds: string[]): Promise<Map<string, PlayerPrediction>> {
    if (playerIds.length === 0) return new Map();
    const predictions = await this.prisma.playerPrediction.findMany({
      where: { playerId: { in: playerIds } },
      orderBy: { asOf: "desc" },
      distinct: ["playerId"],
    });
    return new Map(predictions.map((prediction) => [prediction.playerId, prediction]));
  }
}
