import type { INestApplication } from "@nestjs/common";
import type { Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";

async function createTeam(overrides: Partial<Team> = {}): Promise<Team> {
  return testPrisma.team.create({
    data: {
      nbaTeamId: overrides.nbaTeamId ?? Math.floor(Math.random() * 1_000_000),
      name: overrides.name ?? "Lakers",
      abbreviation: overrides.abbreviation ?? "LAL",
      city: overrides.city ?? "Los Angeles",
      conference: overrides.conference ?? "West",
      division: overrides.division ?? "Pacific",
    },
  });
}

describe("Games API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("GET /v1/games", () => {
    it("returns an empty page when there are no games", async () => {
      const response = await request(app.getHttpServer()).get("/v1/games");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], page: 1, pageSize: 25, total: 0 });
    });

    it("returns games most-recent-first, with home/away team included", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      await testPrisma.game.create({
        data: {
          nbaGameId: "OLDER-GAME",
          gameDate: new Date("2026-01-01"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 100,
          awayScore: 98,
        },
      });
      await testPrisma.game.create({
        data: {
          nbaGameId: "NEWER-GAME",
          gameDate: new Date("2026-02-01"),
          season: "2025-26",
          homeTeamId: celtics.id,
          awayTeamId: lakers.id,
          homeScore: 110,
          awayScore: 105,
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/games");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data.map((game: { nbaGameId: string }) => game.nbaGameId)).toEqual([
        "NEWER-GAME",
        "OLDER-GAME",
      ]);
      expect(response.body.data[0].homeTeam.abbreviation).toBe("BOS");
      expect(response.body.data[0].awayTeam.abbreviation).toBe("LAL");
    });

    it("respects page and pageSize query params", async () => {
      const lakers = await createTeam({ nbaTeamId: 1 });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      for (let i = 0; i < 3; i++) {
        await testPrisma.game.create({
          data: {
            nbaGameId: `GAME-${i}`,
            gameDate: new Date(2026, 0, i + 1),
            season: "2025-26",
            homeTeamId: lakers.id,
            awayTeamId: celtics.id,
            homeScore: 100,
            awayScore: 90,
          },
        });
      }

      const response = await request(app.getHttpServer()).get("/v1/games?page=2&pageSize=2");

      expect(response.body.page).toBe(2);
      expect(response.body.pageSize).toBe(2);
      expect(response.body.total).toBe(3);
      expect(response.body.data).toHaveLength(1);
    });
  });
});
