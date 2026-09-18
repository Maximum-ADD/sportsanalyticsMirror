import { describe, expect, it, vi } from "vitest";
import { compareDatasetReleases, DatasetReleasesService, escapeCsvField, parseReleaseSort } from "./datasets.service.js";

describe("escapeCsvField", () => {
  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns plain text as-is when no special characters", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(3.14)).toBe("3.14");
  });

  it("wraps in double quotes when text contains a comma", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("wraps in double quotes when text contains a double quote (and escapes it)", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in double quotes when text contains a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in double quotes when text contains a carriage return", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });
});

describe("compareDatasetReleases", () => {
  it("reports only changed release metadata", () => {
    const from = { checksum: "old", season: "2025-26", gamesCount: 10, playersCount: 5, eventsCount: 50, fieldSchema: { columns: ["id"] } } as never;
    const to = { ...from, checksum: "new", gamesCount: 11 } as never;

    expect(compareDatasetReleases(from, to).changedFields).toEqual(["checksum", "gamesCount"]);
  });
});

describe("DatasetReleasesService.downloadRelease", () => {
  it("refuses to regenerate a release marked stale by a correction", async () => {
    const prisma = {
      datasetRelease: { findUnique: vi.fn().mockResolvedValue({ isStale: true, checksum: "old-checksum" }) },
    };
    const service = new DatasetReleasesService(prisma as never);

    await expect(service.downloadRelease("2025-26.1")).resolves.toEqual({ kind: "stale", checksum: "old-checksum" });
    expect(prisma.datasetRelease.findUnique).toHaveBeenCalledWith({ where: { version: "2025-26.1" } });
  });
});

describe("parseReleaseSort", () => {
  it("defaults to newest published first", () => {
    expect(parseReleaseSort({})).toEqual({ field: "date", direction: "desc" });
  });

  it("reads season and ascending order off the query", () => {
    expect(parseReleaseSort({ sort: "season", order: "asc" })).toEqual({ field: "season", direction: "asc" });
  });

  it("falls back to the default for unrecognised values rather than erroring", () => {
    expect(parseReleaseSort({ sort: "checksum", order: "sideways" })).toEqual({ field: "date", direction: "desc" });
  });
});

describe("DatasetReleasesService.listReleases", () => {
  function makePrisma() {
    return {
      datasetRelease: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
  }

  it("orders by publish date with season as the tiebreaker by default", async () => {
    const prisma = makePrisma();
    await new DatasetReleasesService(prisma as never).listReleases({});

    expect(prisma.datasetRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ publishedAt: "desc" }, { season: "desc" }] }),
    );
  });

  it("orders by season with publish date as the tiebreaker when asked", async () => {
    const prisma = makePrisma();
    await new DatasetReleasesService(prisma as never).listReleases({ sort: "season", order: "asc" });

    expect(prisma.datasetRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ season: "asc" }, { publishedAt: "desc" }] }),
    );
  });
});

describe("DatasetReleasesService.generateSeasonCsv", () => {
  it("orders players by nbaPlayerId so the same data always hashes the same", async () => {
    // Without an explicit order, Postgres may return rows in a different
    // physical order after an upsert, changing the bytes and the checksum
    // while no stat has changed.
    const prisma = { player: { findMany: vi.fn().mockResolvedValue([]) } };
    await new DatasetReleasesService(prisma as never).generateSeasonCsv("2025-26");

    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nbaPlayerId: "asc" } }),
    );
  });
});
