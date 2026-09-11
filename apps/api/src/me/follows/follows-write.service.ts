import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../../common/api-exception.js";
import { PrismaService } from "../../prisma/prisma.service.js";

/**
 * Every write to the follow graph: the user saying "keep an eye on this
 * player" or "this is my team". Reads live in WatchlistService and
 * TeamResultsService - this class never assembles a response payload, and
 * those never write. Each operation is its own verb-named method rather than
 * one save() that branches, so the create path and the update path can be read
 * (and changed) independently.
 *
 * These rows record the user's own choices. No NBA data is created, changed or
 * deleted here; Player and Team are only ever read, to check that the thing
 * being followed exists.
 */

/** What a followed-player write returns - the row, projected. */
export interface PlayerFollowSummary {
  playerId: string;
  note: string | null;
  followedAt: Date;
}

/** What a followed-team write returns. */
export interface TeamFollowSummary {
  teamId: string;
  isPrimary: boolean;
  followedAt: Date;
}

/** What an unfollow returns: which row was addressed, and whether one went. */
export interface UnfollowResult {
  removed: boolean;
}

@Injectable()
export class FollowsWriteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts following a player, or leaves an existing follow exactly as it is.
   *
   * @param userId - the signed-in user, from the session.
   * @param playerId - the player to follow.
   * @returns the follow row, whether it was just created or already there.
   * @throws ApiException 404 NOT_FOUND when no such player exists.
   * @remarks Idempotent by design: the home page's follow button must be safe
   *          to double-tap, and a retried request must not raise a unique
   *          constraint error. The upsert's update clause is deliberately
   *          empty - repeating the call creates nothing new and changes
   *          nothing, in particular not the scouting note, which only
   *          updatePlayerFollowNote() may touch. Doing it as an upsert rather
   *          than find-then-create also closes the race between two concurrent
   *          first follows.
   */
  async createPlayerFollow(userId: string, playerId: string): Promise<PlayerFollowSummary> {
    await this.assertPlayerExists(playerId);

    const follow = await this.prisma.followedPlayer.upsert({
      where: { userId_playerId: { userId, playerId } },
      create: { userId, playerId },
      update: {},
    });
    return toPlayerFollowSummary(follow);
  }

  /**
   * Replaces the scouting note on a player the user already follows.
   *
   * @param userId - the signed-in user.
   * @param playerId - the followed player.
   * @param note - the new note, or null to clear it.
   * @returns the updated follow row.
   * @throws ApiException 404 NOT_FOUND when the user does not follow this
   *         player. Writing a note is not a way to start following someone -
   *         that is createPlayerFollow's job, and conflating them is exactly
   *         the create/update blur the conventions rule out.
   */
  async updatePlayerFollowNote(
    userId: string,
    playerId: string,
    note: string | null
  ): Promise<PlayerFollowSummary> {
    // The composite unique carries the userId, so this both checks that the
    // follow exists and that it is this user's: another user's follow of the
    // same player is simply not found, and gets the same 404 as no follow at
    // all rather than a different error that would confirm it exists.
    const existingFollow = await this.prisma.followedPlayer.findUnique({
      where: { userId_playerId: { userId, playerId } },
      select: { id: true },
    });
    if (!existingFollow) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "You are not following this player");
    }

    const follow = await this.prisma.followedPlayer.update({
      where: { userId_playerId: { userId, playerId } },
      data: { note },
    });
    return toPlayerFollowSummary(follow);
  }

  /**
   * Stops following a player.
   *
   * @param userId - the signed-in user.
   * @param playerId - the player to unfollow.
   * @returns removed: true if a follow was deleted, false if there was nothing
   *          to delete. Unfollowing someone you never followed is the state
   *          the caller asked for, not an error, so it is never a 404.
   * @remarks Scoped by userId in the same where clause as playerId, so one
   *          user can never delete another's follow.
   */
  async deletePlayerFollow(userId: string, playerId: string): Promise<UnfollowResult> {
    const deletedCount = await this.prisma.followedPlayer.deleteMany({ where: { userId, playerId } });
    return { removed: deletedCount.count > 0 };
  }

  /**
   * Follows a team, or restates an existing follow - including which team is
   * the user's primary one.
   *
   * @param userId - the signed-in user.
   * @param teamId - the team to follow.
   * @param isPrimary - whether this is the one team the home page leads with.
   *                    Absent means false: this is a PUT, so the body is the
   *                    whole intended state of the follow, not a patch of it.
   * @returns the follow row as it now stands.
   * @throws ApiException 404 NOT_FOUND when no such team exists.
   * @remarks The "at most one primary team per user" invariant is enforced
   *          here, inside a transaction that demotes the previous primary
   *          before promoting this one, because Prisma's schema language
   *          cannot express a partial unique index. A raw
   *          `CREATE UNIQUE INDEX ... ON "FollowedTeam"("userId") WHERE
   *          "isPrimary"` added by hand to a migration would harden the
   *          invariant at the database level and make a concurrent double
   *          promotion impossible; until then the transaction is what holds
   *          it, and two simultaneous promotions are serialised by it.
   */
  async putTeamFollow(userId: string, teamId: string, isPrimary: boolean): Promise<TeamFollowSummary> {
    await this.assertTeamExists(teamId);

    const follow = await this.prisma.$transaction(async (transaction) => {
      if (isPrimary) {
        await transaction.followedTeam.updateMany({
          where: { userId, isPrimary: true, teamId: { not: teamId } },
          data: { isPrimary: false },
        });
      }
      return transaction.followedTeam.upsert({
        where: { userId_teamId: { userId, teamId } },
        create: { userId, teamId, isPrimary },
        update: { isPrimary },
      });
    });

    return toTeamFollowSummary(follow);
  }

  /**
   * Stops following a team.
   *
   * @param userId - the signed-in user.
   * @param teamId - the team to unfollow.
   * @returns removed: true if a follow was deleted, false if there was none.
   * @remarks Removing the primary team leaves the user with no primary rather
   *          than silently promoting another follow - which team would be
   *          promoted is the user's decision to make, not this method's.
   */
  async deleteTeamFollow(userId: string, teamId: string): Promise<UnfollowResult> {
    const deletedCount = await this.prisma.followedTeam.deleteMany({ where: { userId, teamId } });
    return { removed: deletedCount.count > 0 };
  }

  private async assertPlayerExists(playerId: string): Promise<void> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
    if (!player) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Player not found");
    }
  }

  private async assertTeamExists(teamId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Team not found");
    }
  }
}

function toPlayerFollowSummary(follow: {
  playerId: string;
  note: string | null;
  createdAt: Date;
}): PlayerFollowSummary {
  return { playerId: follow.playerId, note: follow.note, followedAt: follow.createdAt };
}

function toTeamFollowSummary(follow: {
  teamId: string;
  isPrimary: boolean;
  createdAt: Date;
}): TeamFollowSummary {
  return { teamId: follow.teamId, isPrimary: follow.isPrimary, followedAt: follow.createdAt };
}
