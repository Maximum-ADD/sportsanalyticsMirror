import type { INestApplication } from "@nestjs/common";
import type { Game, Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const ADMIN_USER_ID = "admin-games-1";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

async function createTeam(name: string, abbreviation: string): Promise<Team> {
  return testPrisma.team.create({
    data: { nbaTeamId: uid(), name, abbreviation, city: "City", conference: "West", division: "Pacific" },
  });
}

async function createGame(homeTeamId: string, awayTeamId: string, gameDate: string, season = "2025-26"): Promise<Game> {
  return testPrisma.game.create({
    data: { nbaGameId: `AG-${uid()}`, gameDate: new Date(gameDate), season, homeTeamId, awayTeamId, homeScore: 110, awayScore: 104 },
  });
}

function signInAs(role: "ADMIN" | "ANALYST") {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: ADMIN_USER_ID, role } } as never);
}

describe("Admin game lookup and play-by-play", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Admin", email: "admin-games@example.com", role: "ADMIN" },
    });
  });

  beforeEach(() => signInAs("ADMIN"));

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

  describe("GET /v1/admin/games", () => {
    async function seedSchedule() {
      const warriors = await createTeam("Warriors", "GSW");
      const lakers = await createTeam("Lakers", "LAL");
      const celtics = await createTeam("Celtics", "BOS");
      const aprilGame = await createGame(warriors.id, lakers.id, "2026-04-09");
      const laterAprilGame = await createGame(celtics.id, warriors.id, "2026-04-10");
      const olderGame = await createGame(lakers.id, celtics.id, "2025-02-01", "2024-25");
      await testPrisma.gameEvent.createMany({
        data: Array.from({ length: 3 }, (_, index) => ({
          gameId: aprilGame.id, sequence: index + 1, period: 1, clock: "PT12M00.00S", eventType: "period", description: "marker",
        })),
      });
      return { warriors, lakers, celtics, aprilGame, laterAprilGame, olderGame };
    }

    function listGames(query: Record<string, string> = {}) {
      return request(app.getHttpServer()).get("/v1/admin/games").query(query);
    }

    it("lists games most recent first, with matchup and event counts", async () => {
      const { aprilGame, laterAprilGame, olderGame } = await seedSchedule();

      const response = await listGames();

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(3);
      expect(response.body.data.map((game: { id: string }) => game.id)).toEqual([laterAprilGame.id, aprilGame.id, olderGame.id]);
      expect(response.body.data[1]).toMatchObject({
        homeTeam: { abbreviation: "GSW" },
        awayTeam: { abbreviation: "LAL" },
        eventCount: 3,
        correctionCount: 0,
      });
    });

    it("filters by season, by team on either side, and by an inclusive date window", async () => {
      const { warriors, aprilGame, laterAprilGame, olderGame } = await seedSchedule();
      const idsFor = async (query: Record<string, string>) =>
        (await listGames(query)).body.data.map((game: { id: string }) => game.id);

      expect(await idsFor({ season: "2024-25" })).toEqual([olderGame.id]);
      expect(await idsFor({ teamId: warriors.id })).toEqual([laterAprilGame.id, aprilGame.id]);
      expect(await idsFor({ fromDate: "2026-04-09", toDate: "2026-04-09" })).toEqual([aprilGame.id]);
      expect(await idsFor({ fromDate: "2026-04-10" })).toEqual([laterAprilGame.id]);
    });

    it("rejects a malformed or inverted date window with 400", async () => {
      expect((await listGames({ fromDate: "April 9" })).status).toBe(400);
      expect((await listGames({ fromDate: "2026-04-10", toDate: "2026-04-09" })).status).toBe(400);
    });

    it("is admin-only: an analyst gets 403", async () => {
      signInAs("ANALYST");
      expect((await listGames()).status).toBe(403);
    });
  });

  describe("GET /v1/admin/games/:gameId/events", () => {
    it("returns every event in order with names, the roster with teams, and the vocabulary", async () => {
      const home = await createTeam("Warriors", "GSW");
      const away = await createTeam("Lakers", "LAL");
      const game = await createGame(home.id, away.id, "2026-04-09");
      const curry = await testPrisma.player.create({
        data: { nbaPlayerId: uid(), firstName: "Stephen", lastName: "Curry", position: "G", teamId: home.id },
      });
      // A stat row with no team (older rows): the team comes from his events.
      const james = await testPrisma.player.create({
        data: { nbaPlayerId: uid(), firstName: "LeBron", lastName: "James", position: "F", teamId: null },
      });
      await testPrisma.playerGameStat.createMany({
        data: [curry, james].map((player, index) => ({
          playerId: player.id, gameId: game.id, teamId: index === 0 ? home.id : null, minutes: 30, points: 0, rebounds: 0,
          assists: 0, steals: 0, blocks: 0, turnovers: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, threesMade: 0,
          threesAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0,
        })),
      });
      // More events than the public endpoint's 100-per-page cap, inserted
      // out of order.
      const eventCount = 130;
      await testPrisma.gameEvent.createMany({
        data: Array.from({ length: eventCount }, (_, index) => {
          const sequence = eventCount - index;
          const actor = sequence % 2 === 0 ? { playerId: curry.id, teamId: home.id } : { playerId: james.id, teamId: away.id };
          return { gameId: game.id, sequence, period: 1, clock: "PT11M00.00S", eventType: "foul", value: 0, description: `Foul ${sequence}`, ...actor };
        }),
      });
      await testPrisma.eventCorrection.create({
        data: { gameId: game.id, sequence: 7, previousValues: {}, newValues: {}, reason: "seeded" },
      });

      const response = await request(app.getHttpServer()).get(`/v1/admin/games/${game.id}/events`);

      expect(response.status).toBe(200);
      expect(response.body.game).toMatchObject({ id: game.id, homeTeam: { abbreviation: "GSW" }, awayTeam: { abbreviation: "LAL" }, homeScore: 110 });
      expect(response.body.events).toHaveLength(eventCount);
      expect(response.body.events.map((event: { sequence: number }) => event.sequence)).toEqual(
        Array.from({ length: eventCount }, (_, index) => index + 1),
      );
      expect(response.body.events[1]).toMatchObject({ sequence: 2, playerName: "Stephen Curry", isCorrected: false });
      expect(response.body.events[6]).toMatchObject({ sequence: 7, playerName: "LeBron James", isCorrected: true });
      expect(response.body.roster).toEqual([
        { id: curry.id, firstName: "Stephen", lastName: "Curry", teamId: home.id },
        { id: james.id, firstName: "LeBron", lastName: "James", teamId: away.id },
      ]);
      expect(response.body.eventTypes).toContain("3pt");
    });

    it("returns 404 for a game that doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/admin/games/00000000-0000-0000-0000-000000000000/events");
      expect(response.status).toBe(404);
    });

    it("is admin-only: an analyst gets 403", async () => {
      signInAs("ANALYST");
      const response = await request(app.getHttpServer()).get("/v1/admin/games/any/events");
      expect(response.status).toBe(403);
    });
  });

  describe("GET /v1/admin/events/corrections?gameId=", () => {
    it("filters the history to one game, with the matchup and player names", async () => {
      const home = await createTeam("Warriors", "GSW");
      const away = await createTeam("Lakers", "LAL");
      const game = await createGame(home.id, away.id, "2026-04-09");
      const otherGame = await createGame(away.id, home.id, "2026-04-10");
      const curry = await testPrisma.player.create({
        data: { nbaPlayerId: uid(), firstName: "Stephen", lastName: "Curry", position: "G", teamId: home.id },
      });
      await testPrisma.eventCorrection.create({
        data: { gameId: game.id, sequence: 1, previousValues: { playerId: null }, newValues: { playerId: curry.id }, reason: "r" },
      });
      await testPrisma.eventCorrection.create({
        data: { gameId: otherGame.id, sequence: 1, previousValues: { clock: "a" }, newValues: { clock: "b" }, reason: "r" },
      });

      const response = await request(app.getHttpServer()).get("/v1/admin/events/corrections").query({ gameId: game.id });

      expect(response.body.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({
        game: { homeTeam: { abbreviation: "GSW" }, awayTeam: { abbreviation: "LAL" } },
        playerNames: { [curry.id]: "Stephen Curry" },
        revertedBy: null,
      });
    });

    it("is admin-only: an analyst gets 403", async () => {
      signInAs("ANALYST");
      expect((await request(app.getHttpServer()).get("/v1/admin/events/corrections")).status).toBe(403);
    });
  });
});
