import { HttpStatus, Injectable } from "@nestjs/common";
import { AllTimeLeaderCategory, SeasonType } from "@prisma/client";
import { REFERENCE_DATA_TTL_MS } from "../cache/cache-ttl.js";
import { buildCacheKey, ResponseCacheService } from "../cache/response-cache.service.js";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../prisma/prisma.service.js";

// The two season types apps/ingestion/all_time_leaders.py writes. The NBA's
// playoff career totals already include the Finals, so FINALS and PLAY_IN
// have no leaderboard of their own.
export const LEADERBOARD_SEASON_TYPES = [SeasonType.REGULAR, SeasonType.PLAYOFFS] as const;
export type LeaderboardSeasonType = (typeof LEADERBOARD_SEASON_TYPES)[number];

const DEFAULT_CATEGORY = AllTimeLeaderCategory.POINTS;
const DEFAULT_SEASON_TYPE: LeaderboardSeasonType = SeasonType.REGULAR;

export interface LeaderboardQuery {
  category: AllTimeLeaderCategory;
  seasonType: LeaderboardSeasonType;
}

// A leaderboard player's bio. Every bio field is nullable: a player whose
// bio hasn't been fetched yet has only a name, and the NBA leaves some
// fields blank for early-era players.
export interface AllTimeLeaderPlayerBio {
  nbaPlayerId: number;
  firstName: string;
  lastName: string;
  position: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  birthDate: Date | null;
  school: string | null;
  country: string | null;
  fromYear: number | null;
  toYear: number | null;
  seasonExp: number | null;
  draftYear: number | null;
  draftRound: number | null;
  draftNumber: number | null;
  isGreatest75: boolean;
  isActive: boolean;
  // This app's Player.id when it holds the player, so the page can link to
  // their profile; null for everyone else, which is most retired players.
  playerId: string | null;
}

export interface AllTimeLeaderEntry {
  rank: number;
  value: number;
  player: AllTimeLeaderPlayerBio;
}

export interface AllTimeLeaderboard {
  category: AllTimeLeaderCategory;
  seasonType: LeaderboardSeasonType;
  // When the NBA's figures were last fetched, or null if the ingestion has
  // never run against this database (leaders is empty then too).
  fetchedAt: Date | null;
  leaders: AllTimeLeaderEntry[];
}

const PLAYER_BIO_SELECT = {
  nbaPlayerId: true,
  firstName: true,
  lastName: true,
  position: true,
  heightInches: true,
  weightLbs: true,
  birthDate: true,
  school: true,
  country: true,
  fromYear: true,
  toYear: true,
  seasonExp: true,
  draftYear: true,
  draftRound: true,
  draftNumber: true,
  isGreatest75: true,
  isActive: true,
} as const;

/**
 * Reads one optional enum-valued query parameter.
 *
 * @param rawValue - the parameter as it arrived; anything but a string counts as absent.
 * @param allowed - the values the parameter may take.
 * @param fallback - what an absent or blank parameter means.
 * @param name - the parameter's name, for the error message.
 * @returns the value, or fallback when it was left out.
 * @throws ApiException (400) when a value was given that isn't in allowed.
 */
function parseEnumParameter<T extends string>(rawValue: unknown, allowed: readonly T[], fallback: T, name: string): T {
  if (typeof rawValue !== "string" || rawValue.trim() === "") return fallback;
  const value = rawValue.trim().toUpperCase();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", `${name} must be one of: ${allowed.join(", ")}`);
}

/**
 * Reads the leaderboard's category and seasonType query parameters,
 * defaulting to regular-season points. Case-insensitive, so "points" and
 * "playoffs" work as well as the enum spellings.
 *
 * @throws ApiException (400) for a value that names no leaderboard.
 */
export function parseLeaderboardQuery(query: Record<string, unknown>): LeaderboardQuery {
  return {
    category: parseEnumParameter(query.category, Object.values(AllTimeLeaderCategory), DEFAULT_CATEGORY, "category"),
    seasonType: parseEnumParameter(query.seasonType, LEADERBOARD_SEASON_TYPES, DEFAULT_SEASON_TYPE, "seasonType"),
  };
}

@Injectable()
export class AllTimeLeadersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ResponseCacheService,
  ) {}

  /**
   * Reads one stored all-time leaderboard, best first, with each player's bio.
   *
   * The figures only change when apps/ingestion/all_time_leaders.py runs,
   * so the result is cached for as long as other reference data.
   *
   * @param query - the category and season type to read (see parseLeaderboardQuery).
   * @returns the leaderboard; leaders is empty if the ingestion has never run.
   */
  getLeaderboard(query: LeaderboardQuery): Promise<AllTimeLeaderboard> {
    const cacheKey = buildCacheKey("all-time-leaders", [query.category, query.seasonType]);
    return this.cache.getOrLoad(cacheKey, REFERENCE_DATA_TTL_MS, () => this.loadLeaderboard(query));
  }

  private async loadLeaderboard({ category, seasonType }: LeaderboardQuery): Promise<AllTimeLeaderboard> {
    const rows = await this.prisma.allTimeLeader.findMany({
      where: { category, seasonType },
      orderBy: [{ rank: "asc" }, { value: "desc" }],
      select: { rank: true, value: true, fetchedAt: true, player: { select: PLAYER_BIO_SELECT } },
    });

    const playerIdByNbaId = await this.findHeldPlayerIds(rows.map((row) => row.player.nbaPlayerId));

    return {
      category,
      seasonType,
      fetchedAt: rows[0]?.fetchedAt ?? null,
      leaders: rows.map((row) => ({
        rank: row.rank,
        value: row.value,
        player: { ...row.player, playerId: playerIdByNbaId.get(row.player.nbaPlayerId) ?? null },
      })),
    };
  }

  /**
   * Maps each NBA player id this app also holds as a Player to that
   * Player's id. Ids with no Player row are simply absent from the map.
   */
  private async findHeldPlayerIds(nbaPlayerIds: number[]): Promise<Map<number, string>> {
    if (nbaPlayerIds.length === 0) return new Map();
    const players = await this.prisma.player.findMany({
      where: { nbaPlayerId: { in: nbaPlayerIds } },
      select: { id: true, nbaPlayerId: true },
    });
    return new Map(players.map((player) => [player.nbaPlayerId, player.id]));
  }
}
