import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { parsePageParams, type PagedResult } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { DatasetRelease } from "@prisma/client";

// One row from the releases list, joined with the publisher so the
// datasets page can show who published each release without an extra
// round trip.
export interface ReleaseWithPublisher extends DatasetRelease {
  publishedBy: { id: string; name: string } | null;
}

export interface DatasetReleaseDiff {
  from: DatasetRelease;
  to: DatasetRelease;
  changedFields: string[];
}

// How the releases list can be ordered. "date" is when the release was
// published; "season" is the season the data covers. They differ in
// practice — a backfill of an old season is published late — so the list
// offers both rather than assuming one stands in for the other.
export type ReleaseSortField = "date" | "season";
export type SortDirection = "asc" | "desc";

const DEFAULT_SORT_FIELD: ReleaseSortField = "date";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export interface ReleaseSort {
  field: ReleaseSortField;
  direction: SortDirection;
}

/**
 * Reads the sort field and direction off a query string, falling back to
 * newest-published-first for anything missing or unrecognised. Unknown
 * values are ignored rather than rejected so a stale bookmarked URL still
 * returns a sensible list instead of a 400.
 */
export function parseReleaseSort(query: Record<string, unknown>): ReleaseSort {
  const field: ReleaseSortField = query.sort === "season" ? "season" : DEFAULT_SORT_FIELD;
  const direction: SortDirection = query.order === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
  return { field, direction };
}

/**
 * Builds the Prisma orderBy for a release sort, always with a tiebreaker.
 * The tiebreaker is what actually fixes the list's ordering: every release
 * seeded in one run shares a publishedAt to the second, so sorting on that
 * column alone leaves rows in an arbitrary order that reads as unsorted.
 */
function buildReleaseOrderBy(sort: ReleaseSort) {
  if (sort.field === "season") {
    return [{ season: sort.direction }, { publishedAt: DEFAULT_SORT_DIRECTION }];
  }
  return [{ publishedAt: sort.direction }, { season: DEFAULT_SORT_DIRECTION }];
}

export type DownloadReleaseResult =
  | { kind: "missing" }
  | { kind: "stale"; checksum: string }
  | { kind: "ready"; csv: string; checksum: string };

const DIFFABLE_RELEASE_FIELDS: (keyof Pick<DatasetRelease, "checksum" | "season" | "gamesCount" | "playersCount" | "eventsCount" | "fieldSchema">)[] = [
  "checksum", "season", "gamesCount", "playersCount", "eventsCount", "fieldSchema",
];

export function compareDatasetReleases(from: DatasetRelease, to: DatasetRelease): DatasetReleaseDiff {
  const changedFields = DIFFABLE_RELEASE_FIELDS.filter((field) => JSON.stringify(from[field]) !== JSON.stringify(to[field]));
  return { from, to, changedFields };
}

// Every field in the CSV export, with its type — the schema description
// the brief calls "a description of every field".
interface FieldDescriptor {
  column: string;
  type: "string" | "number" | "date";
  description: string;
}

// The CSV columns a dataset release exports — player identity plus
// career-to-date averages at the time of publishing.
const DATASET_COLUMNS: FieldDescriptor[] = [
  { column: "playerId", type: "string", description: "Internal player UUID" },
  { column: "nbaPlayerId", type: "string", description: "NBA.com player identifier" },
  { column: "firstName", type: "string", description: "Player first name" },
  { column: "lastName", type: "string", description: "Player last name" },
  { column: "position", type: "string", description: "Primary position (PG, SG, SF, PF, C)" },
  { column: "teamAbbreviation", type: "string", description: "Current team abbreviation" },
  { column: "season", type: "string", description: "Season the release covers (e.g. 2025-26)" },
  { column: "gamesPlayed", type: "number", description: "Games played in the season" },
  { column: "pointsPerGame", type: "number", description: "Average points per game" },
  { column: "reboundsPerGame", type: "number", description: "Average rebounds per game" },
  { column: "assistsPerGame", type: "number", description: "Average assists per game" },
  { column: "stealsPerGame", type: "number", description: "Average steals per game" },
  { column: "blocksPerGame", type: "number", description: "Average blocks per game" },
  { column: "fieldGoalPercentage", type: "number", description: "Field goal percentage (0-100)" },
  { column: "threePointPercentage", type: "number", description: "Three-point percentage (0-100)" },
  { column: "freeThrowPercentage", type: "number", description: "Free throw percentage (0-100)" },
  { column: "trueShootingPercentage", type: "number", description: "True shooting percentage (0-100)" },
  { column: "effectiveFieldGoalPercentage", type: "number", description: "Effective field goal percentage (0-100)" },
];

export function escapeCsvField(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

@Injectable()
export class DatasetReleasesService {
  constructor(private readonly prisma: PrismaService) {}

  // Paginated list of all published releases, ordered by publish date or
  // by season (see parseReleaseSort); newest first unless asked otherwise.
  async listReleases(query: Record<string, unknown>): Promise<PagedResult<ReleaseWithPublisher>> {
    const { page, pageSize } = parsePageParams(query);
    const sort = parseReleaseSort(query);
    const where = {};

    const [data, total] = await Promise.all([
      this.prisma.datasetRelease.findMany({
        where,
        include: { publishedBy: { select: { id: true, name: true } } },
        orderBy: buildReleaseOrderBy(sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.datasetRelease.count({ where }),
    ]);

    return { data, page, pageSize, total };
  }

  // Single release by version string.
  async getReleaseByVersion(version: string): Promise<ReleaseWithPublisher | null> {
    return this.prisma.datasetRelease.findUnique({
      where: { version },
      include: { publishedBy: { select: { id: true, name: true } } },
    });
  }

  async diffReleases(fromVersion: string, toVersion: string): Promise<DatasetReleaseDiff | null> {
    const [from, to] = await Promise.all([
      this.prisma.datasetRelease.findUnique({ where: { version: fromVersion } }),
      this.prisma.datasetRelease.findUnique({ where: { version: toVersion } }),
    ]);
    if (!from || !to) return null;
    return compareDatasetReleases(from, to);
  }

  async getChangesSince(since: Date): Promise<ReleaseWithPublisher[]> {
    return this.prisma.datasetRelease.findMany({
      where: { publishedAt: { gt: since } },
      include: { publishedBy: { select: { id: true, name: true } } },
      orderBy: { publishedAt: "asc" },
    });
  }

  // Generate the CSV content for a given season — one row per player
  // with their season averages. Returns the raw CSV string.
  async generateSeasonCsv(season: string): Promise<{ csv: string; rowCount: number; checksum: string }> {
    // Fetch all players with their game stats for this season.
    //
    // The explicit order is what makes the checksum reproducible. Without
    // ORDER BY, Postgres returns rows in whatever physical order they sit
    // in, and ingestion rewrites every player row on each run (roster and
    // bio upserts), which can reshuffle them. Identical stats in a
    // different row order hash differently, so a download would "fail" its
    // checksum with nothing having changed. nbaPlayerId is unique, never
    // changes, and as an integer sorts the same under any text collation.
    const players = await this.prisma.player.findMany({
      orderBy: { nbaPlayerId: "asc" },
      include: {
        team: { select: { abbreviation: true } },
        gameStats: {
          where: { game: { season } },
          include: { game: true },
        },
      },
    });

    const headerLine = DATASET_COLUMNS.map((c) => c.column).join(",");
    const lines: string[] = [headerLine];

    for (const player of players) {
      const stats = player.gameStats;
      const gamesPlayed = stats.length;

      // Skip players with no games in this season — they have nothing
      // to export for it.
      if (gamesPlayed === 0) continue;

      const totalPoints = stats.reduce((s, g) => s + g.points, 0);
      const totalRebounds = stats.reduce((s, g) => s + g.rebounds, 0);
      const totalAssists = stats.reduce((s, g) => s + g.assists, 0);
      const totalSteals = stats.reduce((s, g) => s + g.steals, 0);
      const totalBlocks = stats.reduce((s, g) => s + g.blocks, 0);
      const totalFgm = stats.reduce((s, g) => s + g.fieldGoalsMade, 0);
      const totalFga = stats.reduce((s, g) => s + g.fieldGoalsAttempted, 0);
      const total3pm = stats.reduce((s, g) => s + g.threesMade, 0);
      const total3pa = stats.reduce((s, g) => s + g.threesAttempted, 0);
      const totalFtm = stats.reduce((s, g) => s + g.freeThrowsMade, 0);
      const totalFta = stats.reduce((s, g) => s + g.freeThrowsAttempted, 0);

      const round = (v: number) => Math.round(v * 10) / 10;
      const pct = (m: number, a: number) => (a === 0 ? 0 : round((m / a) * 100));

      const tsa = totalFga + 0.44 * totalFta;
      const tsPct = tsa === 0 ? 0 : round((totalPoints / (2 * tsa)) * 100);
      const efgPct = totalFga === 0 ? 0 : pct(totalFgm + 0.5 * total3pm, totalFga);

      const row = [
        player.id,
        player.nbaPlayerId,
        player.firstName,
        player.lastName,
        player.position,
        player.team?.abbreviation ?? "",
        season,
        gamesPlayed,
        round(totalPoints / gamesPlayed),
        round(totalRebounds / gamesPlayed),
        round(totalAssists / gamesPlayed),
        round(totalSteals / gamesPlayed),
        round(totalBlocks / gamesPlayed),
        pct(totalFgm, totalFga),
        pct(total3pm, total3pa),
        pct(totalFtm, totalFta),
        tsPct,
        efgPct,
      ].map(escapeCsvField).join(",");

      lines.push(row);
    }

    const csv = lines.join("\r\n") + "\r\n";
    const checksum = createHash("sha256").update(csv).digest("hex");

    return { csv, rowCount: lines.length - 1, checksum };
  }

  // Publish a new dataset release — generates the CSV, computes the
  // checksum, and writes the DatasetRelease row.
  async publishRelease(params: {
    version: string;
    description: string;
    season: string;
    publishedById?: string;
  }): Promise<DatasetRelease> {
    const { rowCount, checksum } = await this.generateSeasonCsv(params.season);

    // Games in the season for the metadata. The player count comes from the
    // CSV's own row count, which is already one row per distinct player with
    // games in this season — counting PlayerGameStat rows instead would
    // count player-games, a much larger and quite different number.
    const gamesCount = await this.prisma.game.count({ where: { season: params.season } });
    const playersCount = rowCount;

    const fieldSchema = DATASET_COLUMNS.map((c) => ({
      column: c.column,
      type: c.type,
      description: c.description,
    }));

    return this.prisma.datasetRelease.create({
      data: {
        version: params.version,
        description: params.description,
        season: params.season,
        checksum,
        gamesCount,
        playersCount,
        eventsCount: 0, // Events are per-game, not per-player; not in this CSV
        fieldSchema,
        publishedById: params.publishedById ?? null,
      },
    });
  }

  // Generate the CSV for download — re-derives it so the checksum matches
  // the stored release's checksum (assuming no data changes between publish
  // and download).
  async downloadRelease(version: string): Promise<DownloadReleaseResult> {
    const release = await this.prisma.datasetRelease.findUnique({ where: { version } });
    if (!release) return { kind: "missing" };
    if (release.isStale) return { kind: "stale", checksum: release.checksum };

    const { csv, checksum } = await this.generateSeasonCsv(release.season);
    return { kind: "ready", csv, checksum };
  }
}
