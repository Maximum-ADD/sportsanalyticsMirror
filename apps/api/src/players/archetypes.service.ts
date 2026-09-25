import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { PlayerWithTeam } from "./players.service.js";

// One archetype a player belongs to, strongest first.
export interface ArchetypeMembership {
  label: string;
  // Stable across renames, unlike the label — this is what a URL or a
  // chart colour should key on. See the Archetype model's schema comment.
  clusterId: number;
  rank: number;
  // 0-1. An ordering with a sense of proportion, NOT a probability: it is
  // how close the player sits to this archetype's centre relative to the
  // others (see apps/similarity/clustering.py). Render it as a bar, not to
  // two decimal places.
  weight: number;
}

export interface SimilarPlayer {
  player: PlayerWithTeam;
  rank: number;
  // 0-100. Similarity of STYLE, never of quality — two players can score
  // highly here and be far apart in ability, so nothing should rank
  // players by it.
  similarityScore: number;
}

export interface PlayerArchetypeResponse {
  playerId: string;
  season: string;
  // Up to three, strongest first. More than one is the normal case rather
  // than the exception: the clusters are boundaries through a continuum,
  // so most players genuinely sit between archetypes.
  archetypes: ArchetypeMembership[];
  similarPlayers: SimilarPlayer[];
  // Standardized feature values for the profile radar, in
  // apps/similarity/features.FEATURE_NAMES order.
  featureVector: number[];
  // How far the player sits from their primary archetype's centre. Small
  // means a textbook example, large means the label fits them poorly —
  // worth showing rather than hiding.
  distanceToCentroid: number;
  plot: { x: number; y: number };
}

export interface ArchetypeSummary {
  clusterId: number;
  label: string;
  memberCount: number;
}

@Injectable()
export class ArchetypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists the seasons that have a fitted archetype model, newest first.
   *
   * This is what a season picker is built from. A season with box scores
   * but no fit is absent — apps/similarity has to have been run for it,
   * and until then there is nothing to show.
   */
  async listSeasons(): Promise<string[]> {
    const rows = await this.prisma.archetype.findMany({
      distinct: ["season"],
      select: { season: true },
      orderBy: { season: "desc" },
    });
    return rows.map((row) => row.season);
  }

  /**
   * Resolves the season to read, defaulting to the newest one fitted.
   *
   * Returns null when no season has a model at all, which the caller
   * reports as "no archetypes yet" rather than as a missing player.
   */
  async resolveSeason(requestedSeason?: string): Promise<string | null> {
    if (requestedSeason) return requestedSeason;
    const seasons = await this.listSeasons();
    return seasons[0] ?? null;
  }

  /**
   * Lists one season's archetypes with their member counts, for a browse
   * page and for the cluster map's legend.
   */
  async listArchetypes(season: string): Promise<ArchetypeSummary[]> {
    const archetypes = await this.prisma.archetype.findMany({
      where: { season },
      orderBy: { memberCount: "desc" },
      select: { clusterId: true, label: true, memberCount: true },
    });
    return archetypes;
  }

  /**
   * Reads one player's archetypes and similar players for a season.
   *
   * Returns null when the player has no model row for that season. That is
   * a real and common state, not an error: a player under the minutes
   * floor is deliberately left unplaced rather than given a label their
   * sample cannot support. The caller distinguishes it from a player who
   * does not exist at all.
   *
   * Similar players are read in one query with their teams joined, since
   * the card shows a team badge beside each name.
   */
  async getPlayerArchetype(
    playerId: string,
    season: string
  ): Promise<PlayerArchetypeResponse | null> {
    const placement = await this.prisma.playerArchetype.findUnique({
      where: { playerId_season: { playerId, season } },
      include: {
        memberships: {
          orderBy: { rank: "asc" },
          include: { archetype: { select: { label: true, clusterId: true } } },
        },
      },
    });
    if (!placement) return null;

    const similarities = await this.prisma.playerSimilarity.findMany({
      where: { playerId, season },
      orderBy: { rank: "asc" },
      include: { similarPlayer: { include: { team: true } } },
    });

    return {
      playerId,
      season,
      archetypes: placement.memberships.map((membership) => ({
        label: membership.archetype.label,
        clusterId: membership.archetype.clusterId,
        rank: membership.rank,
        weight: membership.weight,
      })),
      similarPlayers: similarities.map((similarity) => ({
        player: similarity.similarPlayer,
        rank: similarity.rank,
        similarityScore: similarity.similarityScore,
      })),
      // Prisma types a Json column as JsonValue; the writer always stores a
      // number array (see build_archetypes.py), and the cast keeps that
      // contract in one place rather than at every call site.
      featureVector: placement.featureVector as unknown as number[],
      distanceToCentroid: placement.distanceToCentroid,
      plot: { x: placement.plotX, y: placement.plotY },
    };
  }
}
