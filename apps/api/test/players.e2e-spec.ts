import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";

let nextId = 0;
function uniqueId() {
  nextId += 1;
  return nextId;
}

async function createTeam(overrides: Partial<{ name: string; abbreviation: string }> = {}) {
  return testPrisma.team.create({
    data: {
      nbaTeamId: uniqueId(),
      name: overrides.name ?? "Lakers",
      abbreviation: overrides.abbreviation ?? "LAL",
      city: "Los Angeles",
      conference: "West",
      division: "Pacific",
    },
  });
}

async function createPlayer(overrides: {
  teamId?: string | null;
  firstName?: string;
  lastName?: string;
  position?: string;
}) {
  return testPrisma.player.create({
    data: {
      nbaPlayerId: uniqueId(),
      firstName: overrides.firstName ?? "LeBron",
      lastName: overrides.lastName ?? "James",
      position: overrides.position ?? "F",
      teamId: overrides.teamId ?? null,
    },
  });
}

async function createGame(homeTeamId: string, awayTeamId: string, gameDate: Date) {
  return testPrisma.game.create({
    data: {
      nbaGameId: `MOCK-${uniqueId()}`,
      gameDate,
      season: "2025-26",
      homeTeamId,
      awayTeamId,
    },
  });
}

async function createGameStat(playerId: string, gameId: string, overrides: Partial<{ points: number }> = {}) {
  return testPrisma.playerGameStat.create({
    data: {
      playerId,
      gameId,
      minutes: 30,
      points: overrides.points ?? 20,
      rebounds: 5,
      assists: 4,
      steals: 1,
      blocks: 1,
      turnovers: 2,
      fieldGoalsMade: 8,
      fieldGoalsAttempted: 16,
      threesMade: 2,
      threesAttempted: 5,
      freeThrowsMade: 2,
      freeThrowsAttempted: 2,
    },
  });
}

describe("Players API", () => {
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

  describe("GET /v1/players", () => {
    it("returns players with their team embedded, ordered by last name", async () => {
      const team = await createTeam();
      await createPlayer({ teamId: team.id, firstName: "Steph", lastName: "Curry" });
      await createPlayer({ teamId: team.id, firstName: "LeBron", lastName: "James" });

      const response = await request(app.getHttpServer()).get("/v1/players");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data.map((p: { lastName: string }) => p.lastName)).toEqual(["Curry", "James"]);
      expect(response.body.data[0].team).toMatchObject({ id: team.id });
    });

    it("filters by teamId", async () => {
      const lakers = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      await createPlayer({ teamId: lakers.id, lastName: "James" });
      await createPlayer({ teamId: celtics.id, lastName: "Tatum" });

      const response = await request(app.getHttpServer()).get(`/v1/players?teamId=${lakers.id}`);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].lastName).toBe("James");
    });

    it("filters by position", async () => {
      await createPlayer({ lastName: "Guard", position: "G" });
      await createPlayer({ lastName: "Center", position: "C" });

      const response = await request(app.getHttpServer()).get("/v1/players?position=C");

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].lastName).toBe("Center");
    });

    it("returns a player with no team as team: null rather than omitting the field", async () => {
      await createPlayer({ teamId: null, lastName: "FreeAgent" });

      const response = await request(app.getHttpServer()).get("/v1/players");

      expect(response.body.data[0].team).toBeNull();
    });
  });

  describe("GET /v1/players/:id", () => {
    it("returns the player when it exists", async () => {
      const player = await createPlayer({ lastName: "Curry" });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: player.id, lastName: "Curry" });
    });

    it("returns a 404 with the standard error envelope when the player doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Player not found" } });
    });
  });

  describe("GET /v1/players/:id/stats", () => {
    it("returns a 404 when the player doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/does-not-exist/stats");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Player not found" } });
    });

    it("derives season averages and a chronological game log from boxscore rows", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer({ teamId: home.id, lastName: "James" });

      const earlierGame = await createGame(home.id, away.id, new Date("2025-10-15"));
      const laterGame = await createGame(home.id, away.id, new Date("2025-10-20"));
      await createGameStat(player.id, earlierGame.id, { points: 20 });
      await createGameStat(player.id, laterGame.id, { points: 30 });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.playerId).toBe(player.id);
      expect(response.body.seasonAverages.gamesPlayed).toBe(2);
      expect(response.body.seasonAverages.pointsPerGame).toBe(25);
      expect(response.body.gameLog.map((entry: { points: number }) => entry.points)).toEqual([20, 30]);
    });

    it("returns zeroed averages and an empty game log for a player with no games played", async () => {
      const player = await createPlayer({ lastName: "Rookie" });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.seasonAverages.gamesPlayed).toBe(0);
      expect(response.body.gameLog).toEqual([]);
    });
  });
});
