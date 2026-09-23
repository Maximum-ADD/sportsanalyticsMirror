import { HttpStatus, Injectable } from "@nestjs/common";
import type { ProspectEvidence, ProspectGame, ProspectSeason, ProspectValuation } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import type { PageParams, PagedResult } from "../common/pagination.js";
import { USER_ACTIVITY_TTL_MS } from "../cache/cache-ttl.js";
import { buildCacheKey, ResponseCacheService } from "../cache/response-cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { PlayerWithTeam } from "../players/players.service.js";
import { deriveSeasonAverages, type DerivedSeasonAverages } from "../players/season-averages.js";
import { calculateProspectReliability, type ProspectReliability } from "./prospect-reliability.js";
import {
  MINIMUM_GAMES_REQUIRED,
  describeRankState,
  rankProspects,
  type ProspectCandidate,
  type ProspectRankState,
  type ProspectRankedEntry,
} from "./prospect-ranking.js";
import { AvatarStorageService } from "../me/avatar-storage.service.js";
import { EvidenceStorageService } from "./evidence-storage.service.js";
import { ROOKIE_SCALE_REFERENCES, ROOKIE_SCALE_YEAR } from "./rookie-scale-reference.js";

// The cache namespace every Become Pro read shares, so one user's write can
// drop the whole board with a single prefix invalidation.
export const PROSPECT_CACHE_NAMESPACE = "become-pro";

const seasonWithGamesInclude = {
  games: { orderBy: { gameDate: "asc" } },
  evidence: { orderBy: { uploadedAt: "desc" } },
  valuations: { orderBy: { computedAt: "desc" }, take: 1 },
  user: { select: { id: true, username: true, name: true, avatarUrl: true } },
} as const;

type SeasonWithEverything = ProspectSeason & {
  games: ProspectGame[];
  evidence: ProspectEvidence[];
  valuations: ProspectValuation[];
  user: { id: string; username: string | null; name: string; avatarUrl: string | null };
};

/**
 * Reads for the Become Pro feature: the value board, the prospect directory
 * and one prospect's season.
 *
 * Writes live in MeBecomeProService — the split follows the rest of this API,
 * where a public read controller and the signed-in user's own write
 * controller never share a service.
 */
@Injectable()
export class BecomeProService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ResponseCacheService,
    private readonly evidenceStorage: EvidenceStorageService,
    private readonly avatarStorage: AvatarStorageService
  ) {}

  /** Drops every cached board and profile. Called by every write. */
  invalidate(): void {
    this.cache.invalidate(PROSPECT_CACHE_NAMESPACE);
  }

  /**
   * The ranked value board.
   *
   * @param pageParams - already-clamped page/pageSize.
   * @param filters - optional name search and competition-level filter.
   * @param viewerUserId - the signed-in caller, so their own row can be
   *                       marked and their standing returned even when it
   *                       falls outside this page.
   */
  async getLeaderboard(
    pageParams: PageParams,
    filters: { search?: string; level?: string },
    viewerUserId: string | null
  ) {
    // Ranking has to happen over EVERY qualifying season, not over one page:
    // a rank computed within a page would renumber from 1 on page 2. The
    // filters are applied after ranking for the same reason — filtering to
    // one level must not renumber that level's prospects from 1, because the
    // rank on the board and the rank in somebody's header badge would then
    // disagree.
    const ranked = await this.getRankedBoard();

    const search = filters.search?.trim().toLowerCase();
    const matching = ranked.filter((entry) => {
      if (filters.level && entry.competitionLevel !== filters.level) return false;
      if (!search) return true;
      return (
        entry.displayName.toLowerCase().includes(search) || entry.username.toLowerCase().includes(search)
      );
    });

    const viewerUsername = viewerUserId ? await this.usernameFor(viewerUserId) : null;
    const start = (pageParams.page - 1) * pageParams.pageSize;
    const pageRows = matching.slice(start, start + pageParams.pageSize);

    const toEntry = (entry: ProspectRankedEntry) => ({
      ...entry,
      isSelf: viewerUsername !== null && entry.username === viewerUsername,
    });

    const yourStanding = viewerUsername
      ? (ranked.find((entry) => entry.username === viewerUsername) ?? null)
      : null;

    return {
      data: pageRows.map(toEntry),
      page: pageParams.page,
      pageSize: pageParams.pageSize,
      total: matching.length,
      minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
      rookieScaleYear: ROOKIE_SCALE_YEAR,
      // Rookie-scale anchors, so a board with nobody on it still tells a
      // visitor what the numbers mean. Excluded from `total` and never
      // ranked — they are the yardstick, not competitors.
      references: ROOKIE_SCALE_REFERENCES,
      yourStanding: yourStanding ? toEntry(yourStanding) : null,
    };
  }

  /**
   * Everyone with a public season, ranked or not.
   *
   * Deliberately a separate read from the board: a prospect below the games
   * floor never appears there, so routing "browse other players" through the
   * leaderboard would quietly redefine it as "browse the top of a value
   * board" — and the people most likely to be looked up are exactly the ones
   * who have just started.
   */
  async getDirectory(
    pageParams: PageParams,
    filters: { search?: string; level?: string }
  ): Promise<PagedResult<unknown>> {
    const ranked = await this.getRankedBoard();
    const rankByUsername = new Map(ranked.map((entry) => [entry.username, entry.rank]));

    const search = filters.search?.trim();
    const where = {
      isPublic: true,
      user: { username: { not: null } },
      ...(filters.level ? { competitionLevel: filters.level as never } : {}),
      ...(search
        ? {
            user: {
              username: { not: null },
              OR: [
                { username: { contains: search, mode: "insensitive" as const } },
                { name: { contains: search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    const [seasons, total] = await Promise.all([
      this.prisma.prospectSeason.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageParams.page - 1) * pageParams.pageSize,
        take: pageParams.pageSize,
        include: { games: true, user: { select: { username: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.prospectSeason.count({ where }),
    ]);

    const data = await Promise.all(
      seasons.map(async (season) => {
        const averages = deriveSeasonAverages(season.games.map(toDerivableGame));
        return {
          username: season.user.username as string,
          displayName: season.user.username ?? season.user.name,
          avatarUrl: await this.signedAvatarUrlOrNull(season.user.avatarUrl),
          competitionLevel: season.competitionLevel,
          gamesLogged: season.games.length,
          pointsPerGame: averages.pointsPerGame,
          rank: rankByUsername.get(season.user.username as string) ?? null,
        };
      })
    );

    return { data, page: pageParams.page, pageSize: pageParams.pageSize, total };
  }

  /**
   * One prospect's season, with everything a profile page renders.
   *
   * @param username - whose season to read.
   * @param seasonId - which season; defaults to their most recent.
   * @param viewerUserId - the signed-in caller, which decides `isSelf` and
   *                       therefore whether evidence file URLs are included.
   * @throws ApiException 404 when the prospect or the season does not exist,
   *         or when the season is private and the caller is not its owner.
   */
  async getProspect(username: string, seasonId: string | undefined, viewerUserId: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, name: true, avatarUrl: true },
    });
    if (!user) {
      throw new ApiException(HttpStatus.NOT_FOUND, "PROSPECT_NOT_FOUND", `No prospect "${username}"`);
    }

    const isSelf = viewerUserId === user.id;
    const seasons = await this.prisma.prospectSeason.findMany({
      where: { userId: user.id, ...(isSelf ? {} : { isPublic: true }) },
      orderBy: { season: "desc" },
      include: seasonWithGamesInclude,
    });

    if (seasons.length === 0) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "PROSPECT_NOT_FOUND",
        `"${username}" has no season to show`
      );
    }

    const active = seasonId ? seasons.find((season) => season.id === seasonId) : seasons[0];
    if (!active) {
      throw new ApiException(HttpStatus.NOT_FOUND, "SEASON_NOT_FOUND", "No such season");
    }

    return this.serializeProspect(active as SeasonWithEverything, seasons as SeasonWithEverything[], isSelf);
  }

  /**
   * The signed-in user's own standing, join-free by design.
   *
   * This backs the rank badge in the app header, which mounts on EVERY page —
   * so it must never pull the paginated board or a whole profile.
   */
  async getMyRankSummary(userId: string) {
    const [user, season] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
      this.prisma.prospectSeason.findFirst({
        where: { userId },
        orderBy: { season: "desc" },
        include: {
          games: { select: { id: true } },
          valuations: { orderBy: { computedAt: "asc" } },
        },
      }),
    ]);

    const ranked = await this.getRankedBoard();
    const rank = user?.username
      ? (ranked.find((entry) => entry.username === user.username)?.rank ?? null)
      : null;

    const latest = season?.valuations.at(-1) ?? null;
    return {
      rank,
      rankState: describeRankState({
        isPublic: season?.isPublic ?? true,
        gamesLogged: season?.games.length ?? 0,
        hasValuation: latest?.projectedValueUsd != null,
        rank,
      }),
      username: user?.username ?? null,
      projectedValueUsd: latest?.projectedValueUsd ?? null,
      gamesLogged: season?.games.length ?? 0,
      minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
      // Oldest first — the home card plots this as a sparkline, and a trend
      // has to read left to right in time. Only valued runs are points on it.
      valueHistory: (season?.valuations ?? [])
        .filter((valuation) => valuation.projectedValueUsd !== null)
        .map((valuation) => ({
          computedAt: valuation.computedAt,
          valueUsd: valuation.projectedValueUsd as number,
        })),
    };
  }

  // ── internals ───────────────────────────────────────────────────────────

  // The whole ranked board, cached: every profile read needs a rank, and
  // recomputing the ranking per profile would read every season in the
  // database on each page view. USER_ACTIVITY_TTL_MS is the right tier
  // (figures that move when users act), and every write invalidates the
  // namespace directly so a prospect never waits a minute to see their own
  // change.
  private getRankedBoard(): Promise<ProspectRankedEntry[]> {
    return this.cache.getOrLoad(buildCacheKey(PROSPECT_CACHE_NAMESPACE, ["board"]), USER_ACTIVITY_TTL_MS, () =>
      this.buildRankedBoard()
    );
  }

  private async buildRankedBoard(): Promise<ProspectRankedEntry[]> {
    const seasons = await this.prisma.prospectSeason.findMany({
      where: { isPublic: true, user: { username: { not: null } } },
      include: seasonWithGamesInclude,
    });

    const candidates: ProspectCandidate[] = seasons.map((season) => {
      const typed = season as SeasonWithEverything;
      const averages = deriveSeasonAverages(typed.games.map(toDerivableGame));
      const reliability = calculateProspectReliability(
        typed.games.map((game) => evidenceStateFor(game, typed.evidence))
      );
      const valuation = typed.valuations[0] ?? null;

      return {
        username: typed.user.username as string,
        displayName: typed.user.username ?? typed.user.name,
        avatarUrl: typed.user.avatarUrl,
        competitionLevel: typed.competitionLevel,
        gamesLogged: typed.games.length,
        pointsPerGame: averages.pointsPerGame,
        projectedDraftSlot: valuation?.projectedDraftSlot ?? null,
        projectedValueUsd: valuation?.projectedValueUsd ?? null,
        reliabilityTier: reliability.tier,
        verifiedCoverage: reliability.verifiedCoverage,
      };
    });

    const ranked = rankProspects(candidates);
    // Avatar paths are signed here rather than in the candidate map so the
    // (bounded) signing work only happens for rows that actually made the
    // board.
    return Promise.all(
      ranked.map(async (entry) => ({ ...entry, avatarUrl: await this.signedAvatarUrlOrNull(entry.avatarUrl) }))
    );
  }

  private async usernameFor(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    return user?.username ?? null;
  }

  // User.avatarUrl holds a Storage OBJECT PATH, never a URL — the same
  // arrangement MeService uses. Avatars and evidence live in different
  // buckets, so this goes through the avatar signer rather than the evidence
  // one; the two are not interchangeable.
  private async signedAvatarUrlOrNull(objectPath: string | null): Promise<string | null> {
    if (!objectPath) return null;
    return this.avatarStorage.createSignedAvatarUrl(objectPath);
  }

  private async serializeProspect(
    active: SeasonWithEverything,
    seasons: SeasonWithEverything[],
    isSelf: boolean
  ) {
    const averages = deriveSeasonAverages(active.games.map(toDerivableGame));
    const reliability = calculateProspectReliability(
      active.games.map((game) => evidenceStateFor(game, active.evidence))
    );
    const valuationRow = active.valuations[0] ?? null;

    const ranked = await this.getRankedBoard();
    const rank = ranked.find((entry) => entry.username === active.user.username)?.rank ?? null;

    return {
      username: active.user.username as string,
      displayName: active.user.username ?? active.user.name,
      avatarUrl: await this.signedAvatarUrlOrNull(active.user.avatarUrl),
      isSelf,
      rank,
      rankState: describeRankState({
        isPublic: active.isPublic,
        gamesLogged: active.games.length,
        hasValuation: valuationRow?.projectedValueUsd != null,
        rank,
      }) satisfies ProspectRankState,
      seasons: seasons.map((season) => serializeSeason(season)),
      activeSeasonId: active.id,
      seasonAverages: averages satisfies DerivedSeasonAverages,
      gameLog: active.games.map((game) => ({
        gameId: game.id,
        gameDate: game.gameDate,
        points: game.points,
        season: active.season,
      })),
      games: active.games.map((game) => serializeGame(game, active.evidence)),
      evidence: await Promise.all(
          active.evidence.map((document) =>
          this.serializeEvidence(
            document,
            isSelf,
            active.games.filter((game) => game.evidenceId === document.id).length
          )
        )
      ),
      reliability: reliability satisfies ProspectReliability,
      valuation: await this.serializeValuation(active, valuationRow),
    };
  }

  // A scoresheet carries other people's names, so fileUrl is populated only
  // for the owner (and, elsewhere, for an admin reviewing it). Everyone else
  // gets the status and nothing else.
  private async serializeEvidence(document: ProspectEvidence, includeFile: boolean, gamesCovered: number) {
    return {
      id: document.id,
      seasonId: document.seasonId,
      fileName: document.fileName,
      fileUrl: includeFile ? await this.evidenceStorage.createSignedEvidenceUrl(document.objectPath) : null,
      mimeType: document.mimeType,
      status: document.status,
      reviewedAt: document.reviewedAt,
      reviewNote: document.reviewNote,
      gamesCovered,
      uploadedAt: document.uploadedAt,
    };
  }

  // Always returns a valuation object, even when the model has never run for
  // this season: the client renders one shape and reads null figures as "not
  // valued", rather than branching on a missing key.
  private async serializeValuation(season: SeasonWithEverything, row: ProspectValuation | null) {
    const base = {
      seasonId: season.id,
      basis: "LOGGED" as const,
      minimumGamesRequired: MINIMUM_GAMES_REQUIRED,
    };

    if (!row) {
      return {
        ...base,
        projectedDraftSlot: null,
        projectedValueUsd: null,
        projectedValueLowUsd: null,
        projectedValueHighUsd: null,
        rookieScaleYear: ROOKIE_SCALE_YEAR,
        levelFactor: 1,
        levelFactorBasis: "No valuation has been computed for this season yet.",
        modelVersion: "none",
        computedAt: null,
        drivers: [],
        comparables: [],
        slotAlumni: [],
      };
    }

    const [comparables, slotAlumni] = await Promise.all([
      this.resolveComparables(row),
      this.resolvePlayers(row.slotAlumniPlayerIds),
    ]);

    return {
      ...base,
      projectedDraftSlot: row.projectedDraftSlot,
      projectedValueUsd: row.projectedValueUsd,
      projectedValueLowUsd: row.projectedValueLowUsd,
      projectedValueHighUsd: row.projectedValueHighUsd,
      rookieScaleYear: row.rookieScaleYear,
      levelFactor: row.levelFactor,
      levelFactorBasis: row.levelFactorBasis,
      modelVersion: row.modelVersion,
      computedAt: row.computedAt,
      drivers: row.drivers,
      comparables,
      slotAlumni: slotAlumni.map((player) => ({ player, draftYear: player.draftYear ?? 0 })),
    };
  }

  private async resolveComparables(row: ProspectValuation) {
    const players = await this.resolvePlayers(row.comparablePlayerIds);
    const scoreByIndex = new Map(row.comparablePlayerIds.map((id, index) => [id, row.comparableScores[index]]));

    return Promise.all(
      players.map(async (player) => ({
        player,
        // The comparable's own season line, derived through the same code as
        // the prospect's — a comparison against a figure computed a different
        // way would not be a comparison.
        seasonAverages: deriveSeasonAverages(
          await this.prisma.playerGameStat.findMany({ where: { playerId: player.id } })
        ),
        similarity: scoreByIndex.get(player.id) ?? 0,
      }))
    );
  }

  // Preserves the order the model gave them in, which is by descending
  // similarity — findMany does not guarantee it.
  private async resolvePlayers(playerIds: string[]): Promise<PlayerWithTeam[]> {
    if (playerIds.length === 0) return [];
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: { team: true },
    });
    const byId = new Map(players.map((player) => [player.id, player]));
    return playerIds.map((id) => byId.get(id)).filter((player): player is PlayerWithTeam => player !== undefined);
  }
}

function serializeSeason(season: SeasonWithEverything | (ProspectSeason & { games: ProspectGame[] })) {
  return {
    id: season.id,
    season: season.season,
    competitionLevel: season.competitionLevel,
    position: season.position,
    teamName: season.teamName,
    gamesLogged: season.games.length,
    createdAt: season.createdAt,
    updatedAt: season.updatedAt,
  };
}

function serializeGame(game: ProspectGame, evidence: ProspectEvidence[]) {
  const document = evidence.find((candidate) => candidate.id === game.evidenceId) ?? null;
  return {
    id: game.id,
    seasonId: game.seasonId,
    gameDate: game.gameDate,
    opponent: game.opponent,
    minutes: game.minutes,
    points: game.points,
    rebounds: game.rebounds,
    assists: game.assists,
    steals: game.steals,
    blocks: game.blocks,
    turnovers: game.turnovers,
    fieldGoalsMade: game.fieldGoalsMade,
    fieldGoalsAttempted: game.fieldGoalsAttempted,
    threesMade: game.threesMade,
    threesAttempted: game.threesAttempted,
    freeThrowsMade: game.freeThrowsMade,
    freeThrowsAttempted: game.freeThrowsAttempted,
    evidenceId: game.evidenceId,
    // Denormalised so a game row can show its own standing without the
    // caller joining the evidence list itself.
    evidenceStatus: document?.status ?? null,
  };
}

// The four advanced figures a self-reported box score cannot carry are null
// rather than 0 — the shared derivation treats null as "no basis to report",
// which is exactly right here, while a zero would be a real measurement.
function toDerivableGame(game: ProspectGame) {
  return {
    minutes: game.minutes,
    points: game.points,
    rebounds: game.rebounds,
    assists: game.assists,
    steals: game.steals,
    blocks: game.blocks,
    turnovers: game.turnovers,
    fieldGoalsMade: game.fieldGoalsMade,
    fieldGoalsAttempted: game.fieldGoalsAttempted,
    threesMade: game.threesMade,
    threesAttempted: game.threesAttempted,
    freeThrowsMade: game.freeThrowsMade,
    freeThrowsAttempted: game.freeThrowsAttempted,
    plusMinus: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
  };
}

// A game counts as documented when it points at a document, and verified only
// when that document was approved. A REJECTED document counts as neither:
// evidence that was looked at and found wanting is weaker than no claim.
function evidenceStateFor(game: ProspectGame, evidence: ProspectEvidence[]) {
  const document = evidence.find((candidate) => candidate.id === game.evidenceId);
  return {
    hasEvidence: document !== undefined && document.status !== "REJECTED",
    isVerified: document?.status === "VERIFIED",
  };
}
