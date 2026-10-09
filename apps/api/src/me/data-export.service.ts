import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

// Every record this platform holds about one user, as one Prisma select.
// Secrets are left out on purpose: session tokens, the Google OAuth tokens
// on Account and API key hashes would let anyone holding the file act as
// the user. Each is replaced by what it says about the person (that a
// session or key exists, and when) rather than the credential itself.
const PERSONAL_DATA_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  username: true,
  avatarUrl: true,
  role: true,
  autoOpenTutorials: true,
  createdAt: true,
  updatedAt: true,
  favoriteTeam: { select: { name: true, city: true, abbreviation: true } },
  accounts: { select: { providerId: true, createdAt: true } },
  sessions: { select: { createdAt: true, expiresAt: true } },
  followedPlayers: { select: { createdAt: true, player: { select: { firstName: true, lastName: true } } } },
  gamePicks: {
    select: {
      gameId: true,
      pickedTeamId: true,
      outcome: true,
      modelHomeWinProbabilityAtPick: true,
      createdAt: true,
    },
  },
  savedComparisons: {
    select: {
      name: true,
      createdAt: true,
      players: { select: { position: true, player: { select: { firstName: true, lastName: true } } } },
    },
  },
  savedLineups: {
    select: {
      name: true,
      totalPredictedPointsAtSave: true,
      totalSalaryAtSave: true,
      budgetAtSave: true,
      createdAt: true,
      slots: { select: { predictedPointsAtSave: true, salaryAtSave: true, player: { select: { firstName: true, lastName: true } } } },
    },
  },
  prospectSeasons: {
    select: {
      season: true,
      competitionLevel: true,
      position: true,
      teamName: true,
      createdAt: true,
      updatedAt: true,
      games: true,
      valuations: true,
    },
  },
  customStatistics: { select: { name: true, expression: true, version: true, createdAt: true, updatedAt: true } },
  apiConsumer: {
    select: {
      name: true,
      contactEmail: true,
      rateLimit: true,
      dailyQuota: true,
      createdAt: true,
      keys: { select: { label: true, isActive: true, lastUsedAt: true, createdAt: true } },
      _count: { select: { usageLog: true } },
    },
  },
  seenTutorials: { select: { tutorialId: true, seenAt: true } },
} satisfies Prisma.UserSelect;

export type PersonalDataRecord = Prisma.UserGetPayload<{ select: typeof PERSONAL_DATA_SELECT }>;

/** The downloadable copy of a user's data (POPIA s23, access to personal information). */
export interface PersonalDataExport {
  exportedAt: string;
  about: string;
  user: PersonalDataRecord;
}

const EXPORT_DESCRIPTION =
  "Everything the NBA Analytics platform stores about your account. Credentials (session tokens, " +
  "Google sign-in tokens and API key secrets) are left out, because anyone holding them could act as you. " +
  "avatarUrl is the private storage path of your profile photo, not a public link.";

@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads every record the platform holds about one user, for the
   * download-my-data export.
   *
   * @param userId - the signed-in user's id; the export is only ever theirs.
   * @returns the export, or null if the account no longer exists.
   */
  async exportPersonalData(userId: string, now: Date = new Date()): Promise<PersonalDataExport | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PERSONAL_DATA_SELECT });
    if (!user) return null;
    return { exportedAt: now.toISOString(), about: EXPORT_DESCRIPTION, user };
  }
}
