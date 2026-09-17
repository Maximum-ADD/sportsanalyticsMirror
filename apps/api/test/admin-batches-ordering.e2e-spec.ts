/**
 * Ordering for the admin Batches list, against a real database.
 *
 * Worth an e2e rather than only a unit test: the default sort orders
 * through the Game relation (`orderBy: [{ game: { gameDate } }]`), which a
 * mocked Prisma will happily accept whether or not the real client
 * supports it. The behaviour being pinned is the bug this replaced — one
 * pull creates hundreds of batches within seconds, so the previous
 * startedAt ordering left the Date column in an arbitrary order.
 */

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const ADMIN_USER_ID = "admin-batches-ordering-1";
// Every batch is created at this one instant, the way a single pull does.
const SHARED_INGEST_TIME = new Date("2026-09-17T12:00:00.000Z");

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

/** Creates a batch for a game played on `gameDate`, all sharing one
 * startedAt so only the game date can order them meaningfully. */
async function createBatchForGameOn(gameDate: string, season: string, startedAt = SHARED_INGEST_TIME) {
  const team = await testPrisma.team.create({
    data: {
      nbaTeamId: uid(),
      name: `Team ${uid()}`,
      abbreviation: `T${uid()}`,
      city: "City",
      conference: "West",
      division: "Pacific",
    },
  });
  const game = await testPrisma.game.create({
    data: {
      nbaGameId: `ABO-${uid()}`,
      gameDate: new Date(gameDate),
      season,
      homeTeamId: team.id,
      awayTeamId: team.id,
    },
  });
  return testPrisma.ingestionBatch.create({
    data: { gameId: game.id, source: "nba_api", status: "PENDING_REVIEW", startedAt },
  });
}

function gameDatesFrom(body: { data: { game: { gameDate: string } }[] }): string[] {
  return body.data.map((batch) => batch.game.gameDate.slice(0, 10));
}

describe("Admin batches ordering", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Admin", email: "admin-batches-ordering@example.com", role: "ADMIN" },
    });
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: ADMIN_USER_ID, role: "ADMIN" },
    } as never);
  });

  afterEach(async () => {
    await testPrisma.ingestionBatch.deleteMany();
    await testPrisma.game.deleteMany();
    await testPrisma.team.deleteMany();
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { id: ADMIN_USER_ID } });
    await resetDatabase();
    await app.close();
  });

  it("orders by game date descending by default, despite a shared ingest time", async () => {
    for (const gameDate of ["2026-04-15", "2026-04-18", "2026-04-14", "2026-04-17"]) {
      await createBatchForGameOn(gameDate, "2025-26");
    }

    const response = await request(app.getHttpServer()).get("/v1/admin/batches");

    expect(response.status).toBe(200);
    expect(gameDatesFrom(response.body)).toEqual([
      "2026-04-18", "2026-04-17", "2026-04-15", "2026-04-14",
    ]);
  });

  it("orders by game date ascending when asked", async () => {
    for (const gameDate of ["2026-04-15", "2026-04-18", "2026-04-14"]) {
      await createBatchForGameOn(gameDate, "2025-26");
    }

    const response = await request(app.getHttpServer()).get("/v1/admin/batches?sort=date&order=asc");

    expect(response.status).toBe(200);
    expect(gameDatesFrom(response.body)).toEqual(["2026-04-14", "2026-04-15", "2026-04-18"]);
  });

  it("orders by season through the game relation", async () => {
    await createBatchForGameOn("2024-03-01", "2023-24");
    await createBatchForGameOn("2026-04-18", "2025-26");

    const response = await request(app.getHttpServer()).get("/v1/admin/batches?sort=season&order=asc");

    expect(response.status).toBe(200);
    expect(response.body.data.map((batch: { game: { season: string } }) => batch.game.season)).toEqual([
      "2023-24", "2025-26",
    ]);
  });

  it("can still order by ingest time", async () => {
    await createBatchForGameOn("2026-04-18", "2025-26", new Date("2026-09-01T00:00:00.000Z"));
    await createBatchForGameOn("2026-04-14", "2025-26", new Date("2026-09-10T00:00:00.000Z"));

    const response = await request(app.getHttpServer()).get("/v1/admin/batches?sort=ingested&order=desc");

    expect(response.status).toBe(200);
    // The newer ingest wins even though its game is older.
    expect(gameDatesFrom(response.body)).toEqual(["2026-04-14", "2026-04-18"]);
  });

  it("keeps the ordering stable across pages", async () => {
    for (const gameDate of ["2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17"]) {
      await createBatchForGameOn(gameDate, "2025-26");
    }

    const firstPage = await request(app.getHttpServer()).get("/v1/admin/batches?pageSize=2&page=1");
    const secondPage = await request(app.getHttpServer()).get("/v1/admin/batches?pageSize=2&page=2");

    expect(gameDatesFrom(firstPage.body)).toEqual(["2026-04-17", "2026-04-16"]);
    expect(gameDatesFrom(secondPage.body)).toEqual(["2026-04-15", "2026-04-14"]);
  });

  it("falls back to the default order for an unrecognised sort field", async () => {
    await createBatchForGameOn("2026-04-14", "2025-26");
    await createBatchForGameOn("2026-04-18", "2025-26");

    const response = await request(app.getHttpServer()).get("/v1/admin/batches?sort=reviewer");

    expect(response.status).toBe(200);
    expect(gameDatesFrom(response.body)).toEqual(["2026-04-18", "2026-04-14"]);
  });
});
