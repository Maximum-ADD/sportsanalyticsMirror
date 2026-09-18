import type { INestApplication } from "@nestjs/common";
import type { Game, Player, Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const ADMIN_USER_ID = "admin-events-1";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

async function createTeam(): Promise<Team> {
  return testPrisma.team.create({
    data: {
      nbaTeamId: uid(),
      name: "Warriors",
      abbreviation: "GSW",
      city: "San Francisco",
      conference: "West",
      division: "Pacific",
    },
  });
}

async function createPlayer(lastName: string, teamId: string): Promise<Player> {
  return testPrisma.player.create({
    data: { nbaPlayerId: uid(), firstName: "Test", lastName, position: "G", teamId },
  });
}

async function createGame(homeTeamId: string, awayTeamId: string): Promise<Game> {
  return testPrisma.game.create({
    data: {
      nbaGameId: `AE-${uid()}`,
      gameDate: new Date("2025-11-01"),
      season: "2025-26",
      homeTeamId,
      awayTeamId,
    },
  });
}

describe("Admin event corrections and replay", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Admin", email: "admin-events@example.com", role: "ADMIN" },
    });
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: ADMIN_USER_ID, role: "ADMIN" },
    } as never);
  });

  afterEach(async () => {
    await testPrisma.eventCorrection.deleteMany();
    await testPrisma.playerGameStat.deleteMany();
    await testPrisma.gameEvent.deleteMany();
    await testPrisma.game.deleteMany();
    await testPrisma.player.deleteMany();
    await testPrisma.team.deleteMany();
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { id: ADMIN_USER_ID } });
    await resetDatabase();
    await app.close();
  });

  // Sets up a scorer who made an assisted three, plus stale PlayerGameStat
  // rows (all zeros) as if the boxscore-only path had written them before
  // any derivation ran — recompute must bring both back in line.
  async function seedAssistedThree() {
    const team = await createTeam();
    const scorer = await createPlayer("Curry", team.id);
    const passer = await createPlayer("Green", team.id);
    const game = await createGame(team.id, team.id);

    await testPrisma.gameEvent.create({
      data: {
        gameId: game.id,
        sequence: 1,
        period: 1,
        clock: "11:30",
        eventType: "3pt",
        playerId: scorer.id,
        teamId: team.id,
        success: true,
        value: 3,
        description: "Curry 26' 3PT Jump Shot (3 PTS) (Green 1 AST)",
      },
    });
    // The passer needs an event of their own too — a player must appear as
    // an actor somewhere in the game's events to be resolvable as a
    // secondary player at all (see deriveGameEventStats's roster-name
    // index; a bare assist mention is never enough on its own).
    await testPrisma.gameEvent.create({
      data: {
        gameId: game.id,
        sequence: 2,
        period: 1,
        clock: "11:00",
        eventType: "foul",
        playerId: passer.id,
        teamId: team.id,
        description: "Green Personal Foul",
      },
    });

    for (const player of [scorer, passer]) {
      await testPrisma.playerGameStat.create({
        data: {
          playerId: player.id,
          gameId: game.id,
          teamId: team.id,
          minutes: 30,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fieldGoalsMade: 0,
          fieldGoalsAttempted: 0,
          threesMade: 0,
          threesAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
        },
      });
    }

    return { game, scorer, passer };
  }

  describe("POST /v1/admin/games/:gameId/events/:sequence/correct", () => {
    it("re-derives PlayerGameStat for the game from the corrected events", async () => {
      const { game, scorer, passer } = await seedAssistedThree();

      // Correct the shot's clock — a field that doesn't change the
      // aggregation outcome, so this test only proves recompute runs (the
      // rows start at all zeros and don't match the events until it does).
      const response = await request(app.getHttpServer())
        .post(`/v1/admin/games/${game.id}/events/1/correct`)
        .send({ clock: "11:25", reason: "clock sync fix" });

      expect(response.status).toBe(201);

      const scorerStat = await testPrisma.playerGameStat.findUniqueOrThrow({
        where: { playerId_gameId: { playerId: scorer.id, gameId: game.id } },
      });
      expect(scorerStat.points).toBe(3);
      expect(scorerStat.threesMade).toBe(1);
      expect(scorerStat.threesAttempted).toBe(1);

      const passerStat = await testPrisma.playerGameStat.findUniqueOrThrow({
        where: { playerId_gameId: { playerId: passer.id, gameId: game.id } },
      });
      expect(passerStat.assists).toBe(1);
    });

    it("moves derived stats to the corrected player when playerId is reassigned", async () => {
      const { game, scorer, passer } = await seedAssistedThree();

      await request(app.getHttpServer())
        .post(`/v1/admin/games/${game.id}/events/1/correct`)
        .send({ playerId: passer.id, description: "Green 26' 3PT Jump Shot (3 PTS)", reason: "wrong shooter" });

      const scorerStat = await testPrisma.playerGameStat.findUniqueOrThrow({
        where: { playerId_gameId: { playerId: scorer.id, gameId: game.id } },
      });
      expect(scorerStat.points).toBe(0);

      const passerStat = await testPrisma.playerGameStat.findUniqueOrThrow({
        where: { playerId_gameId: { playerId: passer.id, gameId: game.id } },
      });
      expect(passerStat.points).toBe(3);
    });

    it("returns 404 for an event that doesn't exist", async () => {
      const { game } = await seedAssistedThree();

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/games/${game.id}/events/999/correct`)
        .send({ clock: "0:00" });

      expect(response.status).toBe(404);
    });
  });

  describe("POST /v1/admin/games/:gameId/replay", () => {
    it("recomputes stats without requiring any event correction", async () => {
      const { game, scorer } = await seedAssistedThree();

      const response = await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ gameId: game.id, playersRecomputed: 2 });

      const scorerStat = await testPrisma.playerGameStat.findUniqueOrThrow({
        where: { playerId_gameId: { playerId: scorer.id, gameId: game.id } },
      });
      expect(scorerStat.points).toBe(3);
    });

    it("returns 404 for a game that doesn't exist", async () => {
      const response = await request(app.getHttpServer()).post("/v1/admin/games/does-not-exist/replay");
      expect(response.status).toBe(404);
    });

    // Every game ingested before play-by-play was translated holds only
    // period markers. Replaying one used to write 0 over every player's
    // points, rebounds and assists, because nobody could be derived.
    it("leaves a game's stats alone when its events don't involve any player", async () => {
      const team = await createTeam();
      const player = await createPlayer("Curry", team.id);
      const game = await createGame(team.id, team.id);
      await testPrisma.gameEvent.createMany({
        data: [
          { gameId: game.id, sequence: 1, period: 1, clock: "12:00", eventType: "period", subType: "start", description: "Start of 1st Period" },
          { gameId: game.id, sequence: 2, period: 1, clock: "0:00", eventType: "period", subType: "end", description: "End of 1st Period" },
        ],
      });
      await testPrisma.playerGameStat.create({
        data: {
          playerId: player.id, gameId: game.id, teamId: team.id, minutes: 34, points: 31, rebounds: 6, assists: 9,
          steals: 2, blocks: 0, turnovers: 3, fieldGoalsMade: 11, fieldGoalsAttempted: 20, threesMade: 5,
          threesAttempted: 11, freeThrowsMade: 4, freeThrowsAttempted: 4,
        },
      });

      const response = await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);

      expect(response.body).toEqual({ gameId: game.id, playersRecomputed: 0 });
      const stat = await testPrisma.playerGameStat.findUniqueOrThrow({
        where: { playerId_gameId: { playerId: player.id, gameId: game.id } },
      });
      expect({ points: stat.points, rebounds: stat.rebounds, assists: stat.assists }).toEqual({ points: 31, rebounds: 6, assists: 9 });
    });

    it("recomputes players who act in the events and leaves the rest alone", async () => {
      const { game, scorer, passer } = await seedAssistedThree();
      const benchPlayer = await createPlayer("Bench", (await testPrisma.team.findFirstOrThrow()).id);
      // In the boxscore, but never the actor of an event in this game.
      await testPrisma.playerGameStat.create({
        data: {
          playerId: benchPlayer.id, gameId: game.id, minutes: 3, points: 0, rebounds: 0, assists: 1, steals: 0,
          blocks: 0, turnovers: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, threesMade: 0, threesAttempted: 0,
          freeThrowsMade: 0, freeThrowsAttempted: 0,
        },
      });

      await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);

      const stats = await testPrisma.playerGameStat.findMany({ where: { gameId: game.id } });
      const byPlayer = new Map(stats.map((stat) => [stat.playerId, stat]));
      expect(byPlayer.get(scorer.id)?.points).toBe(3);
      expect(byPlayer.get(passer.id)?.assists).toBe(1);
      expect(byPlayer.get(benchPlayer.id)?.assists).toBe(1);
    });
  });
});
