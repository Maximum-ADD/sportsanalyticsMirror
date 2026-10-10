import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../../common/api-exception.js";
import type { PageParams, PagedResult } from "../../common/pagination.js";
import { PrismaService } from "../../prisma/prisma.service.js";

// Every saved comparison is returned with its players already resolved (and
// their team), so the compare page can render a shelf card without a second
// round trip per player.
const savedComparisonInclude = {
  players: {
    orderBy: { position: "asc" },
    include: { player: { include: { team: true } } },
  },
} as const;

/**
 * The signed-in user's saved comparisons. Create, read and delete are separate
 * methods with no shared write path — there is deliberately no "save or update"
 * here; re-saving produces a new row.
 *
 * Every method takes the caller's userId and filters on it. That is the
 * security boundary for this resource: a comparison id alone is never enough
 * to read or delete a row.
 */
@Injectable()
export class SavedComparisonsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads one page of the user's saved comparisons, newest first.
   *
   * @param userId - the signed-in user; rows belonging to anyone else are invisible.
   * @param pageParams - already-clamped page/pageSize from parsePageParams().
   * @returns the standard pagination envelope; `data` is empty for a user who has saved nothing.
   */
  async getSavedComparisons(
    userId: string,
    pageParams: PageParams
  ): Promise<PagedResult<unknown>> {
    const where = { userId };
    const [savedComparisons, total] = await Promise.all([
      this.prisma.savedComparison.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageParams.page - 1) * pageParams.pageSize,
        take: pageParams.pageSize,
        include: savedComparisonInclude,
      }),
      this.prisma.savedComparison.count({ where }),
    ]);
    return { data: savedComparisons, page: pageParams.page, pageSize: pageParams.pageSize, total };
  }

  /**
   * Creates one saved comparison owned by the caller.
   *
   * The player list is stored positionally: `position` preserves the order the
   * user chose their tiles in, which is not recoverable from the ids alone.
   *
   * @param userId - the owner of the new row.
   * @param name - the user's label for the comparison.
   * @param playerIds - 2-4 distinct, existing player ids, in display order.
   * @returns the created comparison with its players resolved.
   * @throws ApiException 404 NOT_FOUND naming the first id that is not a real player.
   */
  async createSavedComparison(userId: string, name: string, playerIds: string[]) {
    await this.assertPlayersExist(playerIds);
    return this.prisma.savedComparison.create({
      data: {
        userId,
        name,
        players: { create: playerIds.map((playerId, index) => ({ playerId, position: index })) },
      },
      include: savedComparisonInclude,
    });
  }

  /**
   * Deletes one of the caller's saved comparisons. Its SavedComparisonPlayer
   * rows go with it via the schema's ON DELETE CASCADE.
   *
   * @param userId - the signed-in user; another user's row is treated as absent.
   * @param savedComparisonId - the row to delete.
   * @throws ApiException 404 NOT_FOUND when no row matches BOTH the id and the owner.
   */
  async deleteSavedComparison(userId: string, savedComparisonId: string): Promise<void> {
    // Filtering the delete itself on userId (rather than reading, checking,
    // then deleting) makes ownership part of the write, so there is no window
    // between the check and the delete — and a row owned by someone else
    // reports exactly the same 404 as one that never existed, which is what
    // stops this endpoint from confirming another user's ids.
    const { count } = await this.prisma.savedComparison.deleteMany({
      where: { id: savedComparisonId, userId },
    });
    if (count === 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Saved comparison not found");
    }
  }

  // Rejects the whole request if any requested player is unknown, rather than
  // silently saving a partial comparison. Named ids come back in the message so
  // the client can say which tile was the problem.
  private async assertPlayersExist(playerIds: string[]): Promise<void> {
    const existingPlayers = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true },
    });
    const existingPlayerIds = new Set(existingPlayers.map((player) => player.id));
    const missingPlayerId = playerIds.find((playerId) => !existingPlayerIds.has(playerId));
    if (missingPlayerId) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", `Player ${missingPlayerId} not found`);
    }
  }
}
