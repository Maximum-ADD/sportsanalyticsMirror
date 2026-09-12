import type { INestApplication } from "@nestjs/common";
import type { Player, Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

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

describe("Optimizer API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1", email: "player@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("GET /v1/optimizer/lineup", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer()).get("/v1/optimizer/lineup");

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });

    it("returns a 404 with the standard error envelope when no lineup exists yet", async () => {
      const response = await request(app.getHttpServer()).get("/v1/optimizer/lineup");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns the most recently created lineup with its players embedded", async () => {
      const team = await createTeam();
      const olderPlayer = await createPlayer(team.id, { nbaPlayerId: 1, lastName: "Older" });
      const newerPlayer = await createPlayer(team.id, { nbaPlayerId: 2, lastName: "Newer" });

      const olderLineup = await testPrisma.lineup.create({
        data: { totalPredictedPoints: 100, totalSalary: 40_000, budget: 50_000 },
      });
      await testPrisma.lineupSlot.create({ data: { lineupId: olderLineup.id, playerId: olderPlayer.id } });

      // Postgres timestamp resolution can tie two inserts in the same
      // millisecond; a short gap keeps "most recent" unambiguous in the test.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const newerLineup = await testPrisma.lineup.create({
        data: { totalPredictedPoints: 150, totalSalary: 48_000, budget: 50_000 },
      });
      await testPrisma.lineupSlot.create({ data: { lineupId: newerLineup.id, playerId: newerPlayer.id } });
      await testPrisma.playerPrediction.create({
        data: { playerId: newerPlayer.id, predictedFantasyPoints: 47.5, salary: 9800 },
      });

      const response = await request(app.getHttpServer()).get("/v1/optimizer/lineup");

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(newerLineup.id);
      expect(response.body.totalPredictedPoints).toBe(150);
      expect(response.body.slots).toHaveLength(1);
      expect(response.body.slots[0].player.lastName).toBe("Newer");
      expect(response.body.slots[0].player.team.abbreviation).toBe(team.abbreviation);
      expect(response.body.slots[0].predictedFantasyPoints).toBe(47.5);
      expect(response.body.slots[0].salary).toBe(9800);
    });

    it("returns null prediction fields for a slot whose player has no prediction on record", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      const lineup = await testPrisma.lineup.create({
        data: { totalPredictedPoints: 40, totalSalary: 9000, budget: 50_000 },
      });
      await testPrisma.lineupSlot.create({ data: { lineupId: lineup.id, playerId: player.id } });

      const response = await request(app.getHttpServer()).get("/v1/optimizer/lineup");

      expect(response.status).toBe(200);
      expect(response.body.slots[0].predictedFantasyPoints).toBeNull();
      expect(response.body.slots[0].salary).toBeNull();
    });
  });

  describe("GET /v1/optimizer/predictions/:playerId", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer()).get("/v1/optimizer/predictions/some-id");

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });

    it("returns the player's latest prediction", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 32.1, salary: 7400 },
      });

      const response = await request(app.getHttpServer()).get(`/v1/optimizer/predictions/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ predictedFantasyPoints: 32.1, salary: 7400 });
    });

    it("prefers the most recent prediction when a player has more than one", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 20, salary: 5000 },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await testPrisma.playerPrediction.create({
        data: { playerId: player.id, predictedFantasyPoints: 25, salary: 5500 },
      });

      const response = await request(app.getHttpServer()).get(`/v1/optimizer/predictions/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ predictedFantasyPoints: 25, salary: 5500 });
    });

    it("returns null fields for a player with no prediction on record", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);

      const response = await request(app.getHttpServer()).get(`/v1/optimizer/predictions/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ predictedFantasyPoints: null, salary: null });
    });
  });

  describe("GET /v1/optimizer/predictions", () => {
    it("requires a signed-in session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer()).get("/v1/optimizer/predictions");

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });

    it("returns an empty list when no predictions exist yet", async () => {
      const response = await request(app.getHttpServer()).get("/v1/optimizer/predictions");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("returns each player's latest prediction with the player embedded", async () => {
      const team = await createTeam();
      const player = await createPlayer(team.id);
      await testPrisma.playerPrediction.create({
        data: {
          playerId: player.id,
          predictedFantasyPoints: 20,
          salary: 5000,
          asOf: new Date("2026-09-12T08:00:00Z"),
        },
      });
      await testPrisma.playerPrediction.create({
        data: {
          playerId: player.id,
          predictedFantasyPoints: 25,
          salary: 5500,
          asOf: new Date("2026-09-12T09:00:00Z"),
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/optimizer/predictions");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].playerId).toBe(player.id);
      // Newest-first ordering means the 09:00 round wins over the 08:00 one.
      expect(response.body[0].predictedFantasyPoints).toBe(25);
      expect(response.body[0].salary).toBe(5500);
      expect(response.body[0].player.lastName).toBe(player.lastName);
      expect(response.body[0].player.team.abbreviation).toBe(team.abbreviation);
    });

    it("lists only one entry per player across multiple players", async () => {
      const team = await createTeam();
      const first = await createPlayer(team.id, { lastName: "First" });
      const second = await createPlayer(team.id, { lastName: "Second" });
      await testPrisma.playerPrediction.create({
        data: { playerId: first.id, predictedFantasyPoints: 30, salary: 7000 },
      });
      await testPrisma.playerPrediction.create({
        data: { playerId: second.id, predictedFantasyPoints: 28, salary: 6800 },
      });

      const response = await request(app.getHttpServer()).get("/v1/optimizer/predictions");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.map((entry: { playerId: string }) => entry.playerId).sort()).toEqual(
        [first.id, second.id].sort()
      );
    });
  });
});
