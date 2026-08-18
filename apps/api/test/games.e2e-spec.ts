import type { INestApplication } from "@nestjs/common";
import type { Player, Team } from "@prisma/client";
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

async function createPlayer(teamId: string, overrides: Partial<Player> = {}): Promise<Player> {
  return testPrisma.player.create({
    data: {
      nbaPlayerId: overrides.nbaPlayerId ?? Math.floor(Math.random() * 1_000_000),
      firstName: overrides.firstName ?? "LeBron",
      lastName: overrides.lastName ?? "James",
      position: overrides.position ?? "F",
      teamId,
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

    it("includes each game's prediction (or null) in the same response, without a separate request per game", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      const predictedGame = await testPrisma.game.create({
        data: {
          nbaGameId: "PREDICTED-GAME",
          gameDate: new Date("2026-02-01"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 110,
          awayScore: 105,
        },
      });
      await testPrisma.gamePrediction.create({
        data: {
          gameId: predictedGame.id,
          homeWinProbability: 0.58,
          homeTeamEloPre: 1505,
          awayTeamEloPre: 1495,
          predictedMarginHome: 2.1,
          marginMethod: "heuristic",
        },
      });
      await testPrisma.game.create({
        data: {
          nbaGameId: "UNPREDICTED-GAME",
          gameDate: new Date("2026-01-01"),
          season: "2025-26",
          homeTeamId: celtics.id,
          awayTeamId: lakers.id,
          homeScore: 100,
          awayScore: 98,
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/games");

      expect(response.status).toBe(200);
      const byNbaGameId = Object.fromEntries(
        response.body.data.map((game: { nbaGameId: string; prediction: unknown }) => [game.nbaGameId, game.prediction])
      );
      expect(byNbaGameId["PREDICTED-GAME"]).toMatchObject({ homeWinProbability: 0.58, marginMethod: "heuristic" });
      expect(byNbaGameId["UNPREDICTED-GAME"]).toBeNull();
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

  describe("GET /v1/games/:id/prediction", () => {
    it("returns a 404 with the standard error envelope for a game that doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/games/does-not-exist/prediction");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(response.body.error.message).toBe("Game not found");
    });

    it("returns a 404 with a predict_games.py hint for a game that exists but has no prediction yet", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await testPrisma.game.create({
        data: {
          nbaGameId: "UNPREDICTED-GAME",
          gameDate: new Date("2026-01-01"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 100,
          awayScore: 98,
        },
      });

      const response = await request(app.getHttpServer()).get(`/v1/games/${game.id}/prediction`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(response.body.error.message).toContain("predict_games.py");
    });

    it("returns the prediction for a game that has one", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await testPrisma.game.create({
        data: {
          nbaGameId: "PREDICTED-GAME",
          gameDate: new Date("2026-01-01"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 100,
          awayScore: 98,
        },
      });
      await testPrisma.gamePrediction.create({
        data: {
          gameId: game.id,
          homeWinProbability: 0.62,
          homeTeamEloPre: 1512.5,
          awayTeamEloPre: 1487.5,
          predictedMarginHome: 3.68,
          marginMethod: "heuristic",
        },
      });

      const response = await request(app.getHttpServer()).get(`/v1/games/${game.id}/prediction`);

      expect(response.status).toBe(200);
      expect(response.body.gameId).toBe(game.id);
      expect(response.body.homeWinProbability).toBe(0.62);
      expect(response.body.predictedMarginHome).toBe(3.68);
      expect(response.body.marginMethod).toBe("heuristic");
    });
  });

  describe("GET /v1/games/:id", () => {
    it("returns a 404 with the standard error envelope for a game that doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/games/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns the game with a null prediction and empty predictedScorers when neither exists yet", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await testPrisma.game.create({
        data: {
          nbaGameId: "DETAIL-GAME-1",
          gameDate: new Date("2026-01-01"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 100,
          awayScore: 98,
        },
      });

      const response = await request(app.getHttpServer()).get(`/v1/games/${game.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(game.id);
      expect(response.body.prediction).toBeNull();
      expect(response.body.predictedScorers).toEqual([]);
    });

    it("predicts each roster player's points from their own prior games, excluding this game itself", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const lebron = await createPlayer(lakers.id, { nbaPlayerId: 1, lastName: "James" });

      const priorGame = await testPrisma.game.create({
        data: {
          nbaGameId: "DETAIL-PRIOR-GAME",
          gameDate: new Date("2025-12-01"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 110,
          awayScore: 100,
        },
      });
      await testPrisma.playerGameStat.create({
        data: {
          playerId: lebron.id,
          gameId: priorGame.id,
          minutes: 34,
          points: 30,
          rebounds: 8,
          assists: 7,
          steals: 1,
          blocks: 0,
          turnovers: 2,
          fieldGoalsMade: 11,
          fieldGoalsAttempted: 20,
          threesMade: 2,
          threesAttempted: 5,
          freeThrowsMade: 6,
          freeThrowsAttempted: 7,
        },
      });

      const targetGame = await testPrisma.game.create({
        data: {
          nbaGameId: "DETAIL-TARGET-GAME",
          gameDate: new Date("2026-01-05"),
          season: "2025-26",
          homeTeamId: lakers.id,
          awayTeamId: celtics.id,
          homeScore: 105,
          awayScore: 95,
        },
      });
      // A stat row on the game being predicted itself — must be excluded
      // from the prediction, not just from a "prior games" filter that
      // happens to work by coincidence of date ordering.
      await testPrisma.playerGameStat.create({
        data: {
          playerId: lebron.id,
          gameId: targetGame.id,
          minutes: 36,
          points: 999,
          rebounds: 9,
          assists: 9,
          steals: 2,
          blocks: 1,
          turnovers: 3,
          fieldGoalsMade: 12,
          fieldGoalsAttempted: 22,
          threesMade: 3,
          threesAttempted: 6,
          freeThrowsMade: 6,
          freeThrowsAttempted: 6,
        },
      });

      const response = await request(app.getHttpServer()).get(`/v1/games/${targetGame.id}`);

      expect(response.status).toBe(200);
      expect(response.body.predictedScorers).toHaveLength(1);
      expect(response.body.predictedScorers[0].player.lastName).toBe("James");
      expect(response.body.predictedScorers[0].predictedPoints).toBe(30);
      expect(response.body.predictedScorers[0].gamesConsidered).toBe(1);
    });
  });
});
