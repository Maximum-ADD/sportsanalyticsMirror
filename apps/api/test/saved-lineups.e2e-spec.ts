import type { Player, Team, User } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const BUDGET = 50_000;
const SLOT_SALARY = 9_000;
const SLOT_POINTS = 40;

async function createUser(id: string): Promise<User> {
  return testPrisma.user.create({ data: { id, name: `User ${id}`, email: `${id}@example.com` } });
}

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

// A solver-legal roster: two guards, two forwards, one center.
async function createLegalRoster(teamId: string): Promise<Player[]> {
  const positions = ["G", "G", "F", "F", "C"];
  const players: Player[] = [];
  for (const [index, position] of positions.entries()) {
    players.push(
      await createPlayer(teamId, { position, nbaPlayerId: 10_000 + index, lastName: `Roster${index}` })
    );
  }
  return players;
}

function makeSaveBody(players: Player[], budget = BUDGET) {
  return {
    budget,
    // Every lineup gets a name (the API rejects a missing one) — the default
    // keeps the constraint-focused tests about the board, not the label.
    name: "Test lineup",
    slots: players.map((player) => ({
      playerId: player.id,
      predictedPointsAtSave: SLOT_POINTS,
      salaryAtSave: SLOT_SALARY,
    })),
  };
}

describe("Saved lineups API", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await createUser("user-1");
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1", email: "user-1@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("GET /v1/me/lineups", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer()).get("/v1/me/lineups");

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });

    it("returns an empty list when the user has saved nothing", async () => {
      const response = await request(app.getHttpServer()).get("/v1/me/lineups");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("never lists another user's lineups", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);
      await request(app.getHttpServer()).post("/v1/me/lineups").send(makeSaveBody(players));

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: "user-2", email: "user-2@example.com" },
      } as never);
      const response = await request(app.getHttpServer()).get("/v1/me/lineups");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe("POST /v1/me/lineups", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer()).post("/v1/me/lineups").send({ budget: BUDGET, slots: [] });

      expect(response.status).toBe(401);
    });

    it("rejects a malformed body with the standard envelope", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send({ budget: "50k", slots: "nope" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it.each([
      [
        "the wrong number of players",
        async (teamId: string) => (await createLegalRoster(teamId)).slice(0, 4),
        /exactly 5 players/,
      ],
      [
        "no guard",
        async (teamId: string) => {
          const positions = ["F", "F", "F", "C", "C"];
          const players: Player[] = [];
          for (const [index, position] of positions.entries()) {
            players.push(
              await createPlayer(teamId, { position, nbaPlayerId: 20_000 + index, lastName: `NoGuard${index}` })
            );
          }
          return players;
        },
        /at least 1 guard/,
      ],
      [
        "no forward",
        async (teamId: string) => {
          const positions = ["G", "G", "G", "C", "C"];
          const players: Player[] = [];
          for (const [index, position] of positions.entries()) {
            players.push(
              await createPlayer(teamId, { position, nbaPlayerId: 30_000 + index, lastName: `NoForward${index}` })
            );
          }
          return players;
        },
        /at least 1 forward/,
      ],
    ])("rejects a board with %s, mirroring the solver", async (_label, buildPlayers, messagePattern) => {
      const team = await createTeam();
      const players = await buildPlayers(team.id);

      const response = await request(app.getHttpServer()).post("/v1/me/lineups").send(makeSaveBody(players));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_LINEUP");
      expect(response.body.error.message).toMatch(messagePattern);
    });

    it("rejects a board whose salary is over the cap", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send(makeSaveBody(players, SLOT_SALARY * 5 - 1));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_LINEUP");
      expect(response.body.error.message).toMatch(/\$1 over the \$44,999 cap/);
    });

    it("rejects a board with the same player twice", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);
      const body = makeSaveBody(players);
      body.slots[4] = { ...body.slots[4], playerId: body.slots[0].playerId };

      const response = await request(app.getHttpServer()).post("/v1/me/lineups").send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_LINEUP");
      expect(response.body.error.message).toMatch(/appears more than once/);
    });

    it("rejects a board referencing a player that doesn't exist", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);
      const body = makeSaveBody(players);
      body.slots[4] = { ...body.slots[4], playerId: "no-such-player" };

      const response = await request(app.getHttpServer()).post("/v1/me/lineups").send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_LINEUP");
      expect(response.body.error.message).toMatch(/doesn't exist/);
    });

    it("stores the trimmed name and echoes it back on the list", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send({ ...makeSaveBody(players), name: "  Week 3 flyers  " });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Week 3 flyers");

      const listResponse = await request(app.getHttpServer()).get("/v1/me/lineups");
      expect(listResponse.body[0].name).toBe("Week 3 flyers");
    });

    it.each([
      ["missing", undefined],
      ["blank", "   "],
    ])("rejects a %s name — every lineup gets one", async (_label, name) => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send({ ...makeSaveBody(players), name });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toMatch(/name/i);
    });

    it("rejects a name over the 50 character cap", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send({ ...makeSaveBody(players), name: "a".repeat(51) });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toMatch(/name must be at most 50 characters/);
    });

    it("rejects a non-string name", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send({ ...makeSaveBody(players), name: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("saves a solver-legal board with frozen values and derived totals", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      const response = await request(app.getHttpServer()).post("/v1/me/lineups").send(makeSaveBody(players));

      expect(response.status).toBe(201);
      expect(response.body.budget).toBe(BUDGET);
      // The default body names the lineup — the save echoes it back.
      expect(response.body.name).toBe("Test lineup");
      expect(response.body.totalPredictedPointsAtSave).toBe(SLOT_POINTS * 5);
      expect(response.body.totalSalaryAtSave).toBe(SLOT_SALARY * 5);
      expect(response.body.slots).toHaveLength(5);
      expect(response.body.slots.map((slot: { playerId: string }) => slot.playerId)).toEqual(
        players.map((player) => player.id)
      );
      expect(response.body.slots[0].player.team.abbreviation).toBe(team.abbreviation);
      // No predictions on record yet: current fields are null and so is drift.
      expect(response.body.slots[0].currentPredictedFantasyPoints).toBeNull();
      expect(response.body.drift).toBeNull();
    });

    it("persists what the board showed even after newer predictions land", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);
      for (const player of players) {
        await testPrisma.playerPrediction.create({
          data: {
            playerId: player.id,
            predictedFantasyPoints: SLOT_POINTS,
            salary: SLOT_SALARY,
            asOf: new Date("2026-09-12T08:00:00Z"),
          },
        });
        await testPrisma.playerPrediction.create({
          data: {
            playerId: player.id,
            predictedFantasyPoints: SLOT_POINTS + 2,
            salary: SLOT_SALARY + 1_500,
            asOf: new Date("2026-09-12T09:00:00Z"),
          },
        });
      }

      const saveResponse = await request(app.getHttpServer())
        .post("/v1/me/lineups")
        .send(makeSaveBody(players));
      expect(saveResponse.status).toBe(201);
      // The save freezes the board's own numbers, not the latest prediction.
      expect(saveResponse.body.totalPredictedPointsAtSave).toBe(SLOT_POINTS * 5);
      expect(saveResponse.body.totalSalaryAtSave).toBe(SLOT_SALARY * 5);

      const listResponse = await request(app.getHttpServer()).get("/v1/me/lineups");
      expect(listResponse.status).toBe(200);
      const [saved] = listResponse.body;
      expect(saved.slots[0].currentPredictedFantasyPoints).toBe(SLOT_POINTS + 2);
      // 5 x +2.0 points, 5 x +$1,500, and 5 x $10,500 = $52,500 > $50,000 cap.
      expect(saved.drift).toEqual({ pointsDelta: 10, salaryDelta: 7_500, isOverBudget: true });
    });

    it("lists newest first", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);

      await testPrisma.savedLineup.create({
        data: {
          userId: "user-1",
          budget: BUDGET,
          createdAt: new Date("2026-09-10T08:00:00Z"),
          slots: { create: [{ playerId: players[0].id, predictedPointsAtSave: 1, salaryAtSave: 1 }] },
        },
      });
      const newer = await request(app.getHttpServer()).post("/v1/me/lineups").send(makeSaveBody(players));
      expect(newer.status).toBe(201);

      const response = await request(app.getHttpServer()).get("/v1/me/lineups");

      expect(response.body.map((saved: { id: string }) => saved.id)).toEqual([newer.body.id, response.body[1].id]);
      expect(response.body[0].createdAt > response.body[1].createdAt).toBe(true);
    });
  });

  describe("DELETE /v1/me/lineups/:lineupId", () => {
    it("deletes the user's own lineup and is idempotent", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);
      const saved = await request(app.getHttpServer()).post("/v1/me/lineups").send(makeSaveBody(players));
      expect(saved.status).toBe(201);

      const deleteResponse = await request(app.getHttpServer()).delete(`/v1/me/lineups/${saved.body.id}`);
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body).toEqual({ deleted: true });

      const listResponse = await request(app.getHttpServer()).get("/v1/me/lineups");
      expect(listResponse.body).toEqual([]);

      const again = await request(app.getHttpServer()).delete(`/v1/me/lineups/${saved.body.id}`);
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ deleted: true });
    });

    it("cannot delete another user's lineup", async () => {
      const team = await createTeam();
      const players = await createLegalRoster(team.id);
      const saved = await request(app.getHttpServer()).post("/v1/me/lineups").send(makeSaveBody(players));
      expect(saved.status).toBe(201);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: "user-2", email: "user-2@example.com" },
      } as never);
      const deleteResponse = await request(app.getHttpServer()).delete(`/v1/me/lineups/${saved.body.id}`);
      expect(deleteResponse.status).toBe(200);

      const listResponse = await request(app.getHttpServer()).get("/v1/me/lineups");
      expect(listResponse.body).toHaveLength(1);
    });
  });
});
