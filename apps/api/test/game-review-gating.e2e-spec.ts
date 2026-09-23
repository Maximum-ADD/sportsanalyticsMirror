/**
 * A game's events and derived stats must not be publicly visible until its
 * play-by-play submission has been reviewed — the brief's "submissions
 * should pass a review before publication" requirement. Before this test
 * existed, `IngestionBatch.status` moved through PENDING_REVIEW ->
 * COMPLETED/REJECTED purely as an admin-facing audit label (see
 * AdminBatchesService.approveBatch/rejectBatch): nothing actually excluded
 * a pending batch's events or PlayerGameStat rows from the public read
 * endpoints, so they were already live the moment ingestion wrote them.
 *
 * This pins the fix (PUBLISHED_GAME_FILTER, ../src/common/game-visibility.ts):
 * a game whose latest batch is PENDING_REVIEW is invisible to
 * GET /v1/games/:id/events and GET /v1/players/:id/stats until an admin
 * approves it, at which point both become visible immediately (the cache
 * invalidation AdminBatchesService.approveBatch already did).
 *
 * Deliberately out of scope, see PROJECT_OVERVIEW.md: GET /v1/games and
 * GET /v1/games/:id (the schedule/score listing) are NOT gated by this
 * fix — only the raw events and the derived PlayerGameStat-based figures
 * are, since those are what the brief means by "published statistics."
 */

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const ADMIN_USER_ID = "admin-review-gating-1";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

async function seedGameWithEventAndStat() {
  const home = await testPrisma.team.create({
    data: { nbaTeamId: uid(), name: "Lakers", abbreviation: "LAL", city: "Los Angeles", conference: "West", division: "Pacific" },
  });
  const away = await testPrisma.team.create({
    data: { nbaTeamId: uid(), name: "Celtics", abbreviation: "BOS", city: "Boston", conference: "East", division: "Atlantic" },
  });
  const player = await testPrisma.player.create({
    data: { nbaPlayerId: uid(), firstName: "LeBron", lastName: "James", position: "F", teamId: home.id },
  });
  const game = await testPrisma.game.create({
    data: { nbaGameId: `RG-${uid()}`, gameDate: new Date("2026-01-01"), season: "2025-26", homeTeamId: home.id, awayTeamId: away.id },
  });
  const batch = await testPrisma.ingestionBatch.create({
    data: { gameId: game.id, source: "nba_api", status: "PENDING_REVIEW" },
  });
  await testPrisma.gameEvent.create({
    data: { gameId: game.id, sequence: 1, period: 1, clock: "PT12M00.00S", eventType: "2pt", description: "Pending shot", batchId: batch.id },
  });
  await testPrisma.playerGameStat.create({
    data: {
      playerId: player.id,
      gameId: game.id,
      minutes: 30,
      points: 20,
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
  return { game, player, batch };
}

describe("Review-gating: a pending batch's game is hidden from public reads until approved", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Admin", email: "admin-review-gating@example.com", role: "ADMIN" },
    });
  });

  afterEach(async () => {
    await testPrisma.eventCorrection.deleteMany();
    await testPrisma.ingestionBatch.deleteMany();
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

  it("hides a pending game's events and stats, then publishes them once an admin approves the batch", async () => {
    const { game, player, batch } = await seedGameWithEventAndStat();

    const pendingEvents = await request(app.getHttpServer()).get(`/v1/games/${game.id}/events`);
    expect(pendingEvents.status).toBe(200);
    expect(pendingEvents.body).toEqual({ data: [], page: 1, pageSize: 25, total: 0 });

    const pendingStats = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);
    expect(pendingStats.status).toBe(200);
    expect(pendingStats.body.seasonAverages.gamesPlayed).toBe(0);
    expect(pendingStats.body.gameLog).toEqual([]);

    // The schedule/score listing is deliberately NOT gated by this fix —
    // see this file's module doc comment. Pinned here so that stays a
    // documented choice rather than something a future change silently
    // reverses in one direction or the other.
    const pendingGameList = await request(app.getHttpServer()).get("/v1/games");
    expect(pendingGameList.body.data.map((g: { id: string }) => g.id)).toContain(game.id);

    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: ADMIN_USER_ID, role: "ADMIN" } } as never);
    const approval = await request(app.getHttpServer()).post(`/v1/admin/batches/${batch.id}/approve`).send({});
    expect(approval.status).toBe(201);

    const publishedEvents = await request(app.getHttpServer()).get(`/v1/games/${game.id}/events`);
    expect(publishedEvents.body.total).toBe(1);
    expect(publishedEvents.body.data[0].description).toBe("Pending shot");

    const publishedStats = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);
    expect(publishedStats.body.seasonAverages.gamesPlayed).toBe(1);
    expect(publishedStats.body.seasonAverages.pointsPerGame).toBe(20);
  });

  it("keeps a rejected batch's game hidden rather than publishing it", async () => {
    const { game, player, batch } = await seedGameWithEventAndStat();

    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: ADMIN_USER_ID, role: "ADMIN" } } as never);
    const rejection = await request(app.getHttpServer()).post(`/v1/admin/batches/${batch.id}/reject`).send({ reviewNotes: "Bad data" });
    expect(rejection.status).toBe(201);

    const events = await request(app.getHttpServer()).get(`/v1/games/${game.id}/events`);
    expect(events.body.total).toBe(0);

    const stats = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);
    expect(stats.body.seasonAverages.gamesPlayed).toBe(0);
  });
});
