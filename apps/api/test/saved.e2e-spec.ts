import type { INestApplication } from "@nestjs/common";
import type { Lineup, Player, Team, User } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const SIGNED_IN_USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

// SavedComparison/SavedLineup carry a real FK onto User, so the row behind the
// mocked session has to exist for any write to land.
async function createUser(id: string): Promise<User> {
  return testPrisma.user.create({
    data: { id, name: `User ${id}`, email: `${id}@example.com` },
  });
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

async function createLineupWithPlayer(playerId: string, overrides: Partial<Lineup> = {}): Promise<Lineup> {
  const lineup = await testPrisma.lineup.create({
    data: {
      totalPredictedPoints: overrides.totalPredictedPoints ?? 120,
      totalSalary: overrides.totalSalary ?? 40_000,
      budget: overrides.budget ?? 50_000,
    },
  });
  await testPrisma.lineupSlot.create({ data: { lineupId: lineup.id, playerId } });
  return lineup;
}

function signInAs(userId: string): void {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com` },
  } as never);
}

describe("Saved shelf API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    signInAs(SIGNED_IN_USER_ID);
    await createUser(SIGNED_IN_USER_ID);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("POST /v1/me/saved/comparisons", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/comparisons")
        .send({ name: "Wings", playerIds: ["a", "b"] });

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });

    it("saves a comparison and reads it back with its players in the saved order", async () => {
      const team = await createTeam();
      const firstPlayer = await createPlayer(team.id, { nbaPlayerId: 1, lastName: "First" });
      const secondPlayer = await createPlayer(team.id, { nbaPlayerId: 2, lastName: "Second" });

      const createResponse = await request(app.getHttpServer())
        .post("/v1/me/saved/comparisons")
        .send({ name: "Wing scorers", playerIds: [secondPlayer.id, firstPlayer.id] });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.name).toBe("Wing scorers");
      expect(createResponse.body.players).toHaveLength(2);

      const listResponse = await request(app.getHttpServer()).get("/v1/me/saved/comparisons");

      expect(listResponse.status).toBe(200);
      expect(listResponse.body).toMatchObject({ page: 1, pageSize: 25, total: 1 });
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].id).toBe(createResponse.body.id);
      expect(listResponse.body.data[0].players.map((entry: { playerId: string }) => entry.playerId)).toEqual([
        secondPlayer.id,
        firstPlayer.id,
      ]);
      expect(listResponse.body.data[0].players[0].player.team.abbreviation).toBe(team.abbreviation);
    });

    it("rejects fewer than two players with a 400", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/comparisons")
        .send({ name: "Solo", playerIds: [player.id] });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("rejects more than four players with a 400", async () => {
      const team = await createTeam();
      const players = await Promise.all(
        [1, 2, 3, 4, 5].map((nbaPlayerId) => createPlayer(team.id, { nbaPlayerId }))
      );

      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/comparisons")
        .send({ name: "Too many", playerIds: players.map((player) => player.id) });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns a 404 naming a player id that does not exist", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/comparisons")
        .send({ name: "Ghost", playerIds: [player.id, "no-such-player"] });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(response.body.error.message).toContain("no-such-player");
    });

    it("rejects a cross-site write with a 403", async () => {
      const team = await createTeam();
      const players = await Promise.all([1, 2].map((nbaPlayerId) => createPlayer(team.id, { nbaPlayerId })));

      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/comparisons")
        .set("Origin", "https://evil.example")
        .send({ name: "Forged", playerIds: players.map((player) => player.id) });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /v1/me/saved/comparisons", () => {
    it("never returns another user's saved comparisons", async () => {
      const team = await createTeam();
      const players = await Promise.all([1, 2].map((nbaPlayerId) => createPlayer(team.id, { nbaPlayerId })));
      await createUser(OTHER_USER_ID);
      await testPrisma.savedComparison.create({
        data: {
          userId: OTHER_USER_ID,
          name: "Someone else's shelf",
          players: { create: players.map((player, index) => ({ playerId: player.id, position: index })) },
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/me/saved/comparisons");

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  describe("DELETE /v1/me/saved/comparisons/:id", () => {
    it("deletes the signed-in user's own comparison", async () => {
      const team = await createTeam();
      const players = await Promise.all([1, 2].map((nbaPlayerId) => createPlayer(team.id, { nbaPlayerId })));
      const saved = await testPrisma.savedComparison.create({
        data: {
          userId: SIGNED_IN_USER_ID,
          name: "Mine",
          players: { create: players.map((player, index) => ({ playerId: player.id, position: index })) },
        },
      });

      const response = await request(app.getHttpServer()).delete(`/v1/me/saved/comparisons/${saved.id}`);

      expect(response.status).toBe(204);
      expect(await testPrisma.savedComparison.count()).toBe(0);
    });

    it("returns a 404 for an id that does not exist", async () => {
      const response = await request(app.getHttpServer()).delete("/v1/me/saved/comparisons/no-such-id");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns a 404 - and leaves the row intact - when the comparison belongs to another user", async () => {
      const team = await createTeam();
      const players = await Promise.all([1, 2].map((nbaPlayerId) => createPlayer(team.id, { nbaPlayerId })));
      await createUser(OTHER_USER_ID);
      const otherUsersComparison = await testPrisma.savedComparison.create({
        data: {
          userId: OTHER_USER_ID,
          name: "Not yours",
          players: { create: players.map((player, index) => ({ playerId: player.id, position: index })) },
        },
      });

      const response = await request(app.getHttpServer()).delete(
        `/v1/me/saved/comparisons/${otherUsersComparison.id}`
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(
        await testPrisma.savedComparison.findUnique({ where: { id: otherUsersComparison.id } })
      ).not.toBeNull();
    });
  });

  describe("POST /v1/me/saved/lineups", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/lineups")
        .send({ name: "Tonight", sourceLineupId: "some-lineup" });

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });

    it("returns a 404 when the source lineup does not exist", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/me/saved/lineups")
        .send({ name: "Tonight", sourceLineupId: "no-such-lineup" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("freezes each slot at the player's latest prediction and reports zero drift straight after saving", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      const lineup = await createLineupWithPlayer(player.id, { totalPredictedPoints: 40, totalSalary: 9000 });
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 40, salary: 9000 },
      });

      const createResponse = await request(app.getHttpServer())
        .post("/v1/me/saved/lineups")
        .send({ name: "Tonight", sourceLineupId: lineup.id });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.sourceLineupId).toBe(lineup.id);
      expect(createResponse.body.totalPredictedPointsAtSave).toBe(40);
      expect(createResponse.body.budgetAtSave).toBe(50_000);
      expect(createResponse.body.slots).toHaveLength(1);
      expect(createResponse.body.slots[0].predictedPointsAtSave).toBe(40);
      expect(createResponse.body.slots[0].salaryAtSave).toBe(9000);

      const listResponse = await request(app.getHttpServer()).get("/v1/me/saved/lineups");

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data[0].drift).toEqual({ pointsDelta: 0, salaryDelta: 0, isOverBudget: false });
    });
  });

  describe("GET /v1/me/saved/lineups", () => {
    it("reports drift against the newest prediction written after the lineup was saved", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      const lineup = await createLineupWithPlayer(player.id, { totalPredictedPoints: 40, totalSalary: 9000 });
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 40, salary: 9000 },
      });

      await request(app.getHttpServer())
        .post("/v1/me/saved/lineups")
        .send({ name: "Tonight", sourceLineupId: lineup.id });

      // Postgres can tie two inserts inside the same millisecond; the gap
      // keeps "latest prediction" unambiguous, as in the optimizer specs.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 47.5, salary: 9800 },
      });

      const response = await request(app.getHttpServer()).get("/v1/me/saved/lineups");

      expect(response.status).toBe(200);
      expect(response.body.data[0].slots[0].predictedPointsAtSave).toBe(40);
      expect(response.body.data[0].drift).toEqual({ pointsDelta: 7.5, salaryDelta: 800, isOverBudget: false });
    });

    it("flags a saved lineup whose players have since been repriced past the budget it was saved under", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      const lineup = await createLineupWithPlayer(player.id, {
        totalPredictedPoints: 40,
        totalSalary: 49_000,
        budget: 50_000,
      });
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 40, salary: 49_000 },
      });

      await request(app.getHttpServer())
        .post("/v1/me/saved/lineups")
        .send({ name: "Tight fit", sourceLineupId: lineup.id });

      await new Promise((resolve) => setTimeout(resolve, 5));
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 41, salary: 51_000 },
      });

      const response = await request(app.getHttpServer()).get("/v1/me/saved/lineups");

      expect(response.status).toBe(200);
      expect(response.body.data[0].drift.isOverBudget).toBe(true);
      expect(response.body.data[0].drift.salaryDelta).toBe(2000);
    });

    it("never returns another user's saved lineups", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      await createUser(OTHER_USER_ID);
      await testPrisma.savedLineup.create({
        data: {
          userId: OTHER_USER_ID,
          name: "Not yours",
          totalPredictedPointsAtSave: 40,
          totalSalaryAtSave: 9000,
          budgetAtSave: 50_000,
          slots: { create: [{ playerId: player.id, predictedPointsAtSave: 40, salaryAtSave: 9000 }] },
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/me/saved/lineups");

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe("DELETE /v1/me/saved/lineups/:id", () => {
    it("deletes the signed-in user's own saved lineup without touching the source lineup", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      const lineup = await createLineupWithPlayer(player.id);
      const saved = await testPrisma.savedLineup.create({
        data: {
          userId: SIGNED_IN_USER_ID,
          name: "Mine",
          sourceLineupId: lineup.id,
          totalPredictedPointsAtSave: 120,
          totalSalaryAtSave: 40_000,
          budgetAtSave: 50_000,
          slots: { create: [{ playerId: player.id, predictedPointsAtSave: 40, salaryAtSave: 9000 }] },
        },
      });

      const response = await request(app.getHttpServer()).delete(`/v1/me/saved/lineups/${saved.id}`);

      expect(response.status).toBe(204);
      expect(await testPrisma.savedLineup.count()).toBe(0);
      expect(await testPrisma.savedLineupSlot.count()).toBe(0);
      expect(await testPrisma.lineup.findUnique({ where: { id: lineup.id } })).not.toBeNull();
    });

    it("returns a 404 - and leaves the row intact - when the saved lineup belongs to another user", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      await createUser(OTHER_USER_ID);
      const otherUsersLineup = await testPrisma.savedLineup.create({
        data: {
          userId: OTHER_USER_ID,
          name: "Not yours",
          totalPredictedPointsAtSave: 40,
          totalSalaryAtSave: 9000,
          budgetAtSave: 50_000,
          slots: { create: [{ playerId: player.id, predictedPointsAtSave: 40, salaryAtSave: 9000 }] },
        },
      });

      const response = await request(app.getHttpServer()).delete(`/v1/me/saved/lineups/${otherUsersLineup.id}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(await testPrisma.savedLineup.findUnique({ where: { id: otherUsersLineup.id } })).not.toBeNull();
    });
  });
});
