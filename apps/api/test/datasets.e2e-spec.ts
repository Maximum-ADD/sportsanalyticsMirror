import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { DatasetReleasesService } from "../src/datasets/datasets.service.js";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

/**
 * Creates a release with only the fields the ordering tests care about.
 * The remaining columns are non-null in the schema but irrelevant here,
 * so they get fixed placeholder values.
 */
async function createRelease(params: { version: string; season: string; publishedAt: Date }) {
  return testPrisma.datasetRelease.create({
    data: {
      version: params.version,
      description: `Release ${params.version}`,
      season: params.season,
      checksum: `checksum-${params.version}`,
      gamesCount: 0,
      playersCount: 0,
      eventsCount: 0,
      fieldSchema: { columns: [] },
      publishedAt: params.publishedAt,
    },
  });
}

describe("Datasets API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /v1/datasets", () => {
    it("returns an empty page when no releases exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/datasets");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it("returns published releases ordered by publishedAt descending", async () => {
      const user = await testPrisma.user.create({
        data: {
          email: `admin-${uid()}@test.com`,
          name: "Admin",
          role: "ADMIN",
        },
      });

      await testPrisma.datasetRelease.create({
        data: {
          version: "2024-25.1",
          description: "First release",
          season: "2024-25",
          checksum: "abc123",
          gamesCount: 10,
          playersCount: 50,
          eventsCount: 500,
          fieldSchema: { columns: [] },
          publishedById: user.id,
        },
      });

      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1",
          description: "Second release",
          season: "2025-26",
          checksum: "def456",
          gamesCount: 20,
          playersCount: 60,
          eventsCount: 800,
          fieldSchema: { columns: [] },
          publishedById: user.id,
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/datasets");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data[0].version).toBe("2025-26.1");
      expect(response.body.data[1].version).toBe("2024-25.1");
    });

    // Releases seeded in a single run share a publishedAt, which left the
    // list in an arbitrary order that read as unsorted on the page. The
    // season tiebreaker is what makes that case deterministic.
    it("falls back to season order for releases published at the same instant", async () => {
      const publishedAt = new Date("2026-09-17T12:00:00.000Z");
      for (const season of ["2024-25", "2026-27", "2023-24", "2025-26"]) {
        await createRelease({ version: `${season}.1`, season, publishedAt });
      }

      const response = await request(app.getHttpServer()).get("/v1/datasets");

      expect(response.status).toBe(200);
      expect(response.body.data.map((release: { version: string }) => release.version)).toEqual([
        "2026-27.1", "2025-26.1", "2024-25.1", "2023-24.1",
      ]);
    });

    it("orders by season ascending when asked", async () => {
      await createRelease({ version: "2025-26.1", season: "2025-26", publishedAt: new Date("2026-01-01") });
      await createRelease({ version: "2023-24.9", season: "2023-24", publishedAt: new Date("2026-06-01") });

      const response = await request(app.getHttpServer()).get("/v1/datasets?sort=season&order=asc");

      expect(response.status).toBe(200);
      expect(response.body.data.map((release: { version: string }) => release.version)).toEqual([
        "2023-24.9", "2025-26.1",
      ]);
    });

    it("ignores an unrecognised sort field instead of erroring", async () => {
      await createRelease({ version: "2025-26.1", season: "2025-26", publishedAt: new Date("2026-01-01") });

      const response = await request(app.getHttpServer()).get("/v1/datasets?sort=checksum");

      expect(response.status).toBe(200);
      expect(response.body.data[0].version).toBe("2025-26.1");
    });
  });

  describe("GET /v1/datasets/:version", () => {
    it("returns a single release with its field schema", async () => {
      const user = await testPrisma.user.create({
        data: {
          email: `admin-${uid()}@test.com`,
          name: "Admin",
          role: "ADMIN",
        },
      });

      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1",
          description: "Initial release",
          season: "2025-26",
          checksum: "sha256hash",
          gamesCount: 10,
          playersCount: 50,
          eventsCount: 500,
          fieldSchema: { columns: ["playerId", "points"] },
          publishedById: user.id,
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1");

      expect(response.status).toBe(200);
      expect(response.body.version).toBe("2025-26.1");
      expect(response.body.fieldSchema).toEqual({ columns: ["playerId", "points"] });
    });

    it("returns a 404 when the version doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/datasets/nonexistent");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /v1/datasets/:version/download", () => {
    it("returns a 404 when the version doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/datasets/nonexistent/download");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns CSV with player stats and checksum header when data exists", async () => {
      // Create teams and a player with game stats so generateSeasonCsv
      // exercises the percentage and per-game average branches.
      const home = await testPrisma.team.create({
        data: {
          nbaTeamId: uid(),
          name: "Lakers",
          abbreviation: "LAL",
          city: "Los Angeles",
          conference: "West",
          division: "Pacific",
        },
      });
      const away = await testPrisma.team.create({
        data: {
          nbaTeamId: uid(),
          name: "Celtics",
          abbreviation: "BOS",
          city: "Boston",
          conference: "East",
          division: "Atlantic",
        },
      });

      const player = await testPrisma.player.create({
        data: {
          nbaPlayerId: uid(),
          firstName: 'Le"Bron',
          lastName: "James",
          position: "F",
          teamId: home.id,
        },
      });

      // A player with no team (exercises the team abbreviation ?? "" branch).
      await testPrisma.player.create({
        data: {
          nbaPlayerId: uid(),
          firstName: "Free",
          lastName: "Agent",
          position: "G",
          teamId: null,
        },
      });

      const game = await testPrisma.game.create({
        data: {
          nbaGameId: `DS-${uid()}`,
          gameDate: new Date("2025-10-15"),
          season: "2025-26",
          seasonType: "REGULAR",
          homeTeamId: home.id,
          awayTeamId: away.id,
        },
      });

      await testPrisma.playerGameStat.create({
        data: {
          playerId: player.id,
          gameId: game.id,
          minutes: 36,
          points: 30,
          rebounds: 8,
          assists: 10,
          steals: 2,
          blocks: 1,
          turnovers: 3,
          fieldGoalsMade: 12,
          fieldGoalsAttempted: 20,
          threesMade: 3,
          threesAttempted: 8,
          freeThrowsMade: 3,
          freeThrowsAttempted: 4,
        },
      });

      // Create the dataset release directly so we can test the download
      // endpoint — the publish endpoint requires admin auth.
      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1",
          description: "Test release",
          season: "2025-26",
          checksum: "placeholder",
          gamesCount: 1,
          playersCount: 1,
          eventsCount: 0,
          fieldSchema: [],
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["x-checksum-sha256"]).toBeTruthy();

      const csv = response.text;
      expect(csv).toContain("playerId");
      expect(csv).toContain("James");
      // The name contains a double quote which must be escaped.
      expect(csv).toContain('"Le""Bron"');
      // Free Agent has no games in this season so should be skipped.
      expect(csv).not.toContain("Agent");
    });

    // The checksum is only meaningful if the same data always produces the
    // same bytes. Players are inserted here in DESCENDING nbaPlayerId order,
    // so without an explicit ORDER BY the rows come back in insertion order
    // and this fails.
    it("emits rows in nbaPlayerId order, so the checksum is reproducible", async () => {
      const team = await testPrisma.team.create({
        data: {
          nbaTeamId: uid(),
          name: "Order FC",
          abbreviation: "ORD",
          city: "City",
          conference: "West",
          division: "Pacific",
        },
      });
      const game = await testPrisma.game.create({
        data: {
          nbaGameId: `DS-ORDER-${uid()}`,
          gameDate: new Date("2025-11-01"),
          season: "2025-26",
          seasonType: "REGULAR",
          homeTeamId: team.id,
          awayTeamId: team.id,
        },
      });

      const nbaPlayerIdsInsertedDescending = [3003, 2002, 1001];
      for (const nbaPlayerId of nbaPlayerIdsInsertedDescending) {
        const player = await testPrisma.player.create({
          data: { nbaPlayerId, firstName: "P", lastName: `Id${nbaPlayerId}`, position: "G", teamId: team.id },
        });
        await testPrisma.playerGameStat.create({
          data: {
            playerId: player.id, gameId: game.id, minutes: 30, points: 10, rebounds: 5, assists: 5,
            steals: 1, blocks: 1, turnovers: 1, fieldGoalsMade: 4, fieldGoalsAttempted: 9,
            threesMade: 1, threesAttempted: 3, freeThrowsMade: 1, freeThrowsAttempted: 2,
          },
        });
      }
      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1", description: "Order test", season: "2025-26", checksum: "placeholder",
          gamesCount: 1, playersCount: 3, eventsCount: 0, fieldSchema: [],
        },
      });

      const first = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      const nbaPlayerIdColumn = first.text
        .trimEnd()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.split(",")[1]);
      expect(nbaPlayerIdColumn).toEqual(["1001", "2002", "3003"]);

      // An update writes a new row version in a new physical position — the
      // same thing ingestion's roster and bio upserts do on every run. It
      // touches no exported column, so the file must hash identically.
      await testPrisma.player.updateMany({ where: { teamId: team.id }, data: { weightLbs: 200 } });
      const second = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");

      expect(second.headers["x-checksum-sha256"]).toBe(first.headers["x-checksum-sha256"]);
    });
  });

  // The guarantee a release exists to give: what you download is exactly
  // what was published, whatever happens to the live data afterwards.
  describe("stored release files", () => {
    async function seedSeasonWithOnePlayer() {
      const team = await testPrisma.team.create({
        data: { nbaTeamId: uid(), name: "Store FC", abbreviation: "STR", city: "City", conference: "East", division: "Atlantic" },
      });
      const game = await testPrisma.game.create({
        data: {
          nbaGameId: `DS-STORE-${uid()}`,
          gameDate: new Date("2025-11-02"),
          season: "2025-26",
          seasonType: "REGULAR",
          homeTeamId: team.id,
          awayTeamId: team.id,
        },
      });
      const player = await testPrisma.player.create({
        data: { nbaPlayerId: uid(), firstName: "Snap", lastName: "Shot", position: "F", teamId: team.id },
      });
      await testPrisma.playerGameStat.create({
        data: {
          playerId: player.id, gameId: game.id, minutes: 30, points: 20, rebounds: 5, assists: 5,
          steals: 1, blocks: 1, turnovers: 1, fieldGoalsMade: 8, fieldGoalsAttempted: 15,
          threesMade: 2, threesAttempted: 5, freeThrowsMade: 2, freeThrowsAttempted: 2,
        },
      });
    }

    it("serves the published snapshot after the live data changes, and after it goes stale", async () => {
      await seedSeasonWithOnePlayer();
      const published = await app
        .get(DatasetReleasesService)
        .publishRelease({ version: "2025-26.1", description: "Snapshot", season: "2025-26" });

      const atPublish = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      expect(atPublish.status).toBe(200);
      expect(atPublish.headers["x-dataset-source"]).toBe("stored");
      expect(atPublish.headers["x-checksum-sha256"]).toBe(published.checksum);
      expect(atPublish.text).toContain(",20,");

      // What a re-ingestion does: rewrite the stats behind the release.
      await testPrisma.playerGameStat.updateMany({ data: { points: 99 } });
      const afterReingest = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      expect(afterReingest.text).toBe(atPublish.text);
      expect(afterReingest.headers["x-checksum-sha256"]).toBe(published.checksum);

      // What a correction does. A stored snapshot stays downloadable.
      await testPrisma.datasetRelease.update({ where: { version: "2025-26.1" }, data: { isStale: true } });
      const afterStale = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      expect(afterStale.status).toBe(200);
      expect(afterStale.text).toBe(atPublish.text);
    });

    // F25: the schedule loads every game of a season up front with no
    // stats, so counting Game rows made a season that hadn't started look
    // loaded.
    it("counts only the games the file was built from, not the scheduled ones", async () => {
      await seedSeasonWithOnePlayer();
      const team = await testPrisma.team.findFirstOrThrow();
      await testPrisma.game.create({
        data: {
          nbaGameId: `DS-SCHEDULED-${uid()}`, gameDate: new Date("2026-04-01"), season: "2025-26",
          seasonType: "REGULAR", homeTeamId: team.id, awayTeamId: team.id,
        },
      });

      const published = await app
        .get(DatasetReleasesService)
        .publishRelease({ version: "2025-26.1", description: "Snapshot", season: "2025-26" });

      expect(published.gamesCount).toBe(1);
      expect(published.playersCount).toBe(1);
    });

    it("refuses to publish a season whose games are only scheduled", async () => {
      const team = await testPrisma.team.create({
        data: { nbaTeamId: uid(), name: "Future FC", abbreviation: "FUT", city: "City", conference: "East", division: "Atlantic" },
      });
      await testPrisma.game.create({
        data: {
          nbaGameId: `DS-FUTURE-${uid()}`, gameDate: new Date("2026-10-21"), season: "2026-27",
          seasonType: "REGULAR", homeTeamId: team.id, awayTeamId: team.id,
        },
      });

      await expect(
        app.get(DatasetReleasesService).publishRelease({ version: "2026-27.1", description: "Too early", season: "2026-27" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await testPrisma.datasetRelease.count()).toBe(0);
    });

    it("never includes the stored file in list or detail responses", async () => {
      await seedSeasonWithOnePlayer();
      await app
        .get(DatasetReleasesService)
        .publishRelease({ version: "2025-26.1", description: "Snapshot", season: "2025-26" });

      const list = await request(app.getHttpServer()).get("/v1/datasets");
      const detail = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1");

      expect(list.body.data[0].version).toBe("2025-26.1");
      expect(list.body.data[0]).not.toHaveProperty("csv");
      expect(detail.body.checksum).toBeTruthy();
      expect(detail.body).not.toHaveProperty("csv");
    });

    it("still rebuilds a release published before files were stored", async () => {
      await seedSeasonWithOnePlayer();
      await createRelease({ version: "2025-26.1", season: "2025-26", publishedAt: new Date("2026-01-01") });

      const response = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");

      expect(response.status).toBe(200);
      expect(response.headers["x-dataset-source"]).toBe("rebuilt");
      expect(response.headers["content-disposition"]).toContain('filename="dataset-2025-26.1-rebuilt.csv"');
    });

    // F26: a stale release with no stored file used to answer 409 with no
    // file at all. It now rebuilds, and the checksum tells the caller
    // whether the rebuild is the file that was published.
    it("rebuilds a stale release published before files were stored, and the checksum says whether it matches", async () => {
      await seedSeasonWithOnePlayer();
      const published = await app
        .get(DatasetReleasesService)
        .publishRelease({ version: "2025-26.1", description: "Snapshot", season: "2025-26" });
      const original = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      // Turn it into a release from before files were stored, published
      // before the next game, and since gone stale.
      await testPrisma.datasetRelease.update({
        where: { version: "2025-26.1" },
        data: { csv: null, isStale: true, publishedAt: new Date("2026-01-01T00:00:00.000Z") },
      });

      // A game played after the release was published stays out of it.
      const [team, player] = await Promise.all([testPrisma.team.findFirstOrThrow(), testPrisma.player.findFirstOrThrow()]);
      const later = await testPrisma.game.create({
        data: {
          nbaGameId: `DS-LATER-${uid()}`, gameDate: new Date("2026-02-01"), season: "2025-26",
          seasonType: "REGULAR", homeTeamId: team.id, awayTeamId: team.id,
        },
      });
      await testPrisma.playerGameStat.create({
        data: {
          playerId: player.id, gameId: later.id, minutes: 40, points: 44, rebounds: 9, assists: 9,
          steals: 2, blocks: 2, turnovers: 2, fieldGoalsMade: 16, fieldGoalsAttempted: 25,
          threesMade: 4, threesAttempted: 8, freeThrowsMade: 8, freeThrowsAttempted: 9,
        },
      });

      const unchanged = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      expect(unchanged.status).toBe(200);
      expect(unchanged.headers["x-dataset-source"]).toBe("rebuilt");
      expect(unchanged.text).toBe(original.text);
      expect(unchanged.headers["x-checksum-sha256"]).toBe(published.checksum);

      // A correction to a game it covers: still a file, but not the same one.
      await testPrisma.playerGameStat.updateMany({ where: { gameId: { not: later.id } }, data: { points: 21 } });
      const corrected = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1/download");
      expect(corrected.status).toBe(200);
      expect(corrected.headers["x-dataset-source"]).toBe("rebuilt");
      expect(corrected.headers["x-checksum-sha256"]).not.toBe(published.checksum);
    });
  });
});
