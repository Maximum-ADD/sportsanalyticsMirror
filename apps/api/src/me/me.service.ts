import { Injectable } from "@nestjs/common";
import type { Team, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { PlayerWithTeam } from "../players/players.service.js";
import { AvatarStorageService } from "./avatar-storage.service.js";

// 3-20 chars, alphanumeric + underscore, must start with a letter — mirrors
// the kind of handle every other "pick a username" flow uses (GitHub,
// Discord, etc.), and starting with a letter keeps a username from ever
// being confused with a numeric id. Not specified further than this by the
// feature brief, so treat as a judgment call.
const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export interface MeProfile {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  favoriteTeam: Team | null;
  followedPlayers: PlayerWithTeam[];
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatarStorage: AvatarStorageService
  ) {}

  // Builds the full GET /v1/me response from a bare BetterAuth session user
  // — re-reads favoriteTeam/followedPlayers fresh from Postgres (the session
  // object itself only carries the BetterAuth core fields) and signs a live
  // URL for avatarUrl, since what's actually stored there is a private
  // Storage object path, not a renderable URL (see AvatarStorageService).
  async getProfile(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        favoriteTeam: true,
        followedPlayers: { include: { player: { include: { team: true } } }, orderBy: { createdAt: "desc" } },
      },
    });

    const avatarUrl = user.avatarUrl ? await this.avatarStorage.createSignedAvatarUrl(user.avatarUrl) : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatarUrl,
      favoriteTeam: user.favoriteTeam,
      followedPlayers: user.followedPlayers.map((follow) => follow.player),
    };
  }

  async isUsernameTaken(username: string, excludingUserId: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({ where: { username } });
    return existing !== null && existing.id !== excludingUserId;
  }

  async updateProfile(
    userId: string,
    updates: { username?: string; favoriteTeamId?: string | null }
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(updates.username !== undefined ? { username: updates.username } : {}),
        ...(updates.favoriteTeamId !== undefined ? { favoriteTeamId: updates.favoriteTeamId } : {}),
      },
    });
  }

  // Uploads the new avatar first, then swaps User.avatarUrl to the new
  // object path, then best-effort deletes the old object — in that order,
  // so a failed upload or a crash mid-request never leaves a user pointing
  // at an object that no longer exists. Returns a freshly-signed URL for
  // the new avatar so the frontend can render it immediately without a
  // second round trip.
  async updateAvatar(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<string | null> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const newObjectPath = await this.avatarStorage.uploadAvatar(userId, file);

    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: newObjectPath } });

    if (user.avatarUrl) {
      await this.avatarStorage.deleteObjectBestEffort(user.avatarUrl);
    }

    return this.avatarStorage.createSignedAvatarUrl(newObjectPath);
  }

  // Idempotent by design (see MeController) — following an already-followed
  // player, or unfollowing one that isn't followed, is a no-op success
  // rather than a 409/404, since the caller only ever cares about the end
  // state ("this player is now followed") not whether this specific request
  // was the one that changed it.
  async followPlayer(userId: string, playerId: string): Promise<void> {
    await this.prisma.userFollowedPlayer.upsert({
      where: { userId_playerId: { userId, playerId } },
      create: { userId, playerId },
      update: {},
    });
  }

  async unfollowPlayer(userId: string, playerId: string): Promise<void> {
    await this.prisma.userFollowedPlayer.deleteMany({ where: { userId, playerId } });
  }
}
