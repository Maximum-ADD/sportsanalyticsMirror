import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const ADMIN_USER_ID = "admin-anomalies-1";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

describe("GET /v1/admin/games/:gameId/anomalies", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Admin", email: "admin-anomalies@example.com", role: "ADMIN" },
    });
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: ADMIN_USER_ID, role: "ADMIN" },
    } as never);
  });

  afterEach(async () => {
    await testPrisma.playerGameStat.deleteMany();
    await testPrisma.game.deleteMany();
    await testPrisma.player.deleteMany();
    await testPrisma.team.deleteMany();
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { id: ADMIN_USER_ID } });
    await resetDatabase();
    await app.close();
  });

  it("flags a row with impossible shooting splits and leaves a clean row alone", async () => {
    const team = await testPrisma.team.create({
      data: {
        nbaTeamId: uid(),
        name: "Warriors",
        abbreviation: "GSW",
        city: "San Francisco",
        conference: "West",
        division: "Pacific",
      },
    });
    const suspect = await testPrisma.player.create({
      data: { nbaPlayerId: uid(), firstName: "Test", lastName: "Curry", position: "G", teamId: team.id },
    });
    const clean = await testPrisma.player.create({
      data: { nbaPlayerId: uid(), firstName: "Test", lastName: "Green", position: "F", teamId: team.id },
    });
    const game = await testPrisma.game.create({
      data: {
        nbaGameId: `AA-${uid()}`,
        gameDate: new Date("2025-11-01"),
        season: "2025-26",
        homeTeamId: team.id,
        awayTeamId: team.id,
      },
    });

    await testPrisma.playerGameStat.create({
      data: {
        playerId: suspect.id,
        gameId: game.id,
        teamId: team.id,
        minutes: 30,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        // Impossible: more makes than attempts.
        fieldGoalsMade: 9,
        fieldGoalsAttempted: 8,
        threesMade: 0,
        threesAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
      },
    });
    await testPrisma.playerGameStat.create({
      data: {
        playerId: clean.id,
        gameId: game.id,
        teamId: team.id,
        minutes: 20,
        points: 4,
        rebounds: 1,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fieldGoalsMade: 2,
        fieldGoalsAttempted: 4,
        threesMade: 0,
        threesAttempted: 1,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
      },
    });

    const response = await request(app.getHttpServer()).get(`/v1/admin/games/${game.id}/anomalies`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].playerId).toBe(suspect.id);
    expect(response.body[0].findings.map((f: { code: string }) => f.code)).toEqual(
      expect.arrayContaining(["FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED"]),
    );
  });

  it("returns an empty array when nothing looks wrong", async () => {
    const team = await testPrisma.team.create({
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
      data: { nbaPlayerId: uid(), firstName: "Test", lastName: "Tatum", position: "F", teamId: team.id },
    });
    const game = await testPrisma.game.create({
      data: {
        nbaGameId: `AA-${uid()}`,
        gameDate: new Date("2025-11-01"),
        season: "2025-26",
        homeTeamId: team.id,
        awayTeamId: team.id,
      },
    });
    await testPrisma.playerGameStat.create({
      data: {
        playerId: player.id,
        gameId: game.id,
        teamId: team.id,
        minutes: 34,
        points: 23,
        rebounds: 5,
        assists: 6,
        steals: 1,
        blocks: 0,
        turnovers: 2,
        fieldGoalsMade: 8,
        fieldGoalsAttempted: 14,
        threesMade: 4,
        threesAttempted: 9,
        freeThrowsMade: 3,
        freeThrowsAttempted: 3,
        offensiveRebounds: 1,
        defensiveRebounds: 4,
      },
    });

    const response = await request(app.getHttpServer()).get(`/v1/admin/games/${game.id}/anomalies`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns an empty array for a game with no PlayerGameStat rows", async () => {
    const team = await testPrisma.team.create({
      data: {
        nbaTeamId: uid(),
        name: "Nuggets",
        abbreviation: "DEN",
        city: "Denver",
        conference: "West",
        division: "Northwest",
      },
    });
    const game = await testPrisma.game.create({
      data: {
        nbaGameId: `AA-${uid()}`,
        gameDate: new Date("2025-11-01"),
        season: "2025-26",
        homeTeamId: team.id,
        awayTeamId: team.id,
      },
    });

    const response = await request(app.getHttpServer()).get(`/v1/admin/games/${game.id}/anomalies`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
