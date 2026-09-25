import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import { ArchetypesService } from "./archetypes.service.js";

/**
 * Builds a mocked PrismaService exposing only the four tables this service
 * reads, so a test states exactly what the database returns.
 */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    archetype: { findMany: vi.fn().mockResolvedValue([]) },
    playerArchetype: { findUnique: vi.fn().mockResolvedValue(null) },
    playerSimilarity: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
}

function makePlacement(overrides: Record<string, unknown> = {}) {
  return {
    id: "placement-1",
    playerId: "player-1",
    season: "2025-26",
    featureVector: [0.5, -1.2, 0.3],
    distanceToCentroid: 1.04,
    plotX: -1.62,
    plotY: 1.44,
    memberships: [
      { rank: 1, weight: 0.68, archetype: { label: "Point forward", clusterId: 3 } },
      { rank: 2, weight: 0.19, archetype: { label: "Scoring wing", clusterId: 7 } },
    ],
    ...overrides,
  };
}

describe("ArchetypesService", () => {
  let prisma: PrismaService;
  let service: ArchetypesService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ArchetypesService(prisma);
  });

  describe("resolving which season to read", () => {
    it("uses the requested season when one is given", async () => {
      expect(await service.resolveSeason("2023-24")).toBe("2023-24");
      // No need to look up what exists when the caller has said.
      expect(prisma.archetype.findMany).not.toHaveBeenCalled();
    });

    it("falls back to the most recently fitted season", async () => {
      prisma = makePrisma({
        archetype: {
          findMany: vi.fn().mockResolvedValue([{ season: "2025-26" }, { season: "2024-25" }]),
        },
      });
      service = new ArchetypesService(prisma);
      expect(await service.resolveSeason()).toBe("2025-26");
    });

    it("returns null when no season has been fitted at all", async () => {
      // apps/similarity has never been run against this database. Not an
      // error, and not any particular player's problem.
      expect(await service.resolveSeason()).toBeNull();
    });
  });

  describe("reading a player's archetypes", () => {
    it("returns null when the player has no placement that season", async () => {
      // The minutes-floor case: the player exists and simply was not placed.
      expect(await service.getPlayerArchetype("player-1", "2025-26")).toBeNull();
    });

    it("returns the archetypes strongest first with their stable cluster ids", async () => {
      prisma = makePrisma({
        playerArchetype: { findUnique: vi.fn().mockResolvedValue(makePlacement()) },
      });
      service = new ArchetypesService(prisma);

      const result = await service.getPlayerArchetype("player-1", "2025-26");

      expect(result?.archetypes).toEqual([
        { label: "Point forward", clusterId: 3, rank: 1, weight: 0.68 },
        { label: "Scoring wing", clusterId: 7, rank: 2, weight: 0.19 },
      ]);
    });

    it("carries the cluster id through, not only the label", async () => {
      // A label can be renamed at any time; a URL or a chart colour keyed
      // on it would break. The cluster id is what survives a rename.
      prisma = makePrisma({
        playerArchetype: { findUnique: vi.fn().mockResolvedValue(makePlacement()) },
      });
      service = new ArchetypesService(prisma);

      const result = await service.getPlayerArchetype("player-1", "2025-26");
      expect(result?.archetypes.every((archetype) => typeof archetype.clusterId === "number")).toBe(true);
    });

    it("keeps a specialist's single archetype rather than padding the list", async () => {
      prisma = makePrisma({
        playerArchetype: {
          findUnique: vi.fn().mockResolvedValue(
            makePlacement({
              memberships: [
                { rank: 1, weight: 0.88, archetype: { label: "Catch-and-shoot wing", clusterId: 1 } },
              ],
            })
          ),
        },
      });
      service = new ArchetypesService(prisma);

      const result = await service.getPlayerArchetype("player-1", "2025-26");
      expect(result?.archetypes).toHaveLength(1);
    });

    it("returns the similar players with their teams for the card", async () => {
      prisma = makePrisma({
        playerArchetype: { findUnique: vi.fn().mockResolvedValue(makePlacement()) },
        playerSimilarity: {
          findMany: vi.fn().mockResolvedValue([
            {
              rank: 1,
              similarityScore: 91.4,
              similarPlayer: { id: "player-2", lastName: "Antetokounmpo", team: { abbreviation: "MIL" } },
            },
          ]),
        },
      });
      service = new ArchetypesService(prisma);

      const result = await service.getPlayerArchetype("player-1", "2025-26");

      expect(result?.similarPlayers).toHaveLength(1);
      expect(result?.similarPlayers[0].rank).toBe(1);
      expect(result?.similarPlayers[0].similarityScore).toBe(91.4);
      expect(result?.similarPlayers[0].player.team?.abbreviation).toBe("MIL");
    });

    it("reads similar players scoped to the same season", async () => {
      // Each season is its own fit, so a 2024-25 neighbour has no business
      // appearing on a 2025-26 card.
      const findMany = vi.fn().mockResolvedValue([]);
      prisma = makePrisma({
        playerArchetype: { findUnique: vi.fn().mockResolvedValue(makePlacement()) },
        playerSimilarity: { findMany },
      });
      service = new ArchetypesService(prisma);

      await service.getPlayerArchetype("player-1", "2025-26");

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { playerId: "player-1", season: "2025-26" } })
      );
    });

    it("passes the feature vector and plot position through for the radar and the map", async () => {
      prisma = makePrisma({
        playerArchetype: { findUnique: vi.fn().mockResolvedValue(makePlacement()) },
      });
      service = new ArchetypesService(prisma);

      const result = await service.getPlayerArchetype("player-1", "2025-26");

      expect(result?.featureVector).toEqual([0.5, -1.2, 0.3]);
      expect(result?.plot).toEqual({ x: -1.62, y: 1.44 });
      expect(result?.distanceToCentroid).toBe(1.04);
    });
  });

  describe("listing a season's archetypes", () => {
    it("returns them with member counts, largest first", async () => {
      const findMany = vi.fn().mockResolvedValue([
        { clusterId: 2, label: "Scoring wing", memberCount: 53 },
        { clusterId: 5, label: "Point forward", memberCount: 19 },
      ]);
      prisma = makePrisma({ archetype: { findMany } });
      service = new ArchetypesService(prisma);

      const result = await service.listArchetypes("2025-26");

      expect(result).toHaveLength(2);
      expect(result[0].memberCount).toBe(53);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { season: "2025-26" } })
      );
    });
  });
});
