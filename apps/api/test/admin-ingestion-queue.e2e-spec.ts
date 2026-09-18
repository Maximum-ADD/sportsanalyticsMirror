/**
 * The pull queue, end to end over HTTP against a real database.
 *
 * Queue mode is what the deployed API runs in: it can't reach stats.nba.com,
 * so "Pull Data" records a request for a pull worker instead of spawning
 * ingest.py. INGESTION_MODE=queue forces that mode here, whatever this
 * machine has installed, so the test behaves the same locally and in CI.
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

const ADMIN_USER_ID = "admin-ingestion-queue-1";

describe("Admin pull queue", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.INGESTION_MODE = "queue";
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Queue Admin", email: "queue-admin@example.com", role: "ADMIN" },
    });
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: ADMIN_USER_ID, role: "ADMIN" },
    } as never);
  });

  afterEach(async () => {
    await testPrisma.ingestionRequest.deleteMany();
    await testPrisma.ingestionWorker.deleteMany();
  });

  afterAll(async () => {
    delete process.env.INGESTION_MODE;
    await testPrisma.user.deleteMany({ where: { id: ADMIN_USER_ID } });
    await resetDatabase();
    await app.close();
  });

  function pull(body: Record<string, string> = {}) {
    return request(app.getHttpServer()).post("/v1/admin/ingestion/pull").send(body);
  }

  it("queues a pull with its window and shows it in the queue", async () => {
    const response = await pull({ season: "2025-26", fromDate: "2026-04-14", toDate: "2026-04-18" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ started: true, queued: true });

    const queue = await request(app.getHttpServer()).get("/v1/admin/ingestion/requests");
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({
      status: "QUEUED",
      season: "2025-26",
      fromDate: "2026-04-14",
      toDate: "2026-04-18",
      scheduled: false,
      requestedBy: { id: ADMIN_USER_ID, name: "Queue Admin" },
    });
  });

  it("refuses a second pull while one is queued", async () => {
    await pull();
    const second = await pull();

    expect(second.body.started).toBe(false);
    expect(second.body.message).toMatch(/already queued/i);
    expect(await testPrisma.ingestionRequest.count()).toBe(1);
  });

  it("rejects a malformed window without queuing anything", async () => {
    const response = await pull({ fromDate: "18/04/2026" });

    expect(response.body.started).toBe(false);
    expect(await testPrisma.ingestionRequest.count()).toBe(0);
  });

  it("cancels a queued pull, frees the queue, and refuses to cancel it twice", async () => {
    await pull();
    const [queued] = (await request(app.getHttpServer()).get("/v1/admin/ingestion/requests")).body;

    const cancel = await request(app.getHttpServer()).post(`/v1/admin/ingestion/requests/${queued.id}/cancel`);
    expect(cancel.status).toBe(201);
    expect(cancel.body).toEqual({ cancelled: true });

    const again = await request(app.getHttpServer()).post(`/v1/admin/ingestion/requests/${queued.id}/cancel`);
    expect(again.status).toBe(409);

    // A cancelled request no longer blocks a new one.
    const next = await pull();
    expect(next.body.queued).toBe(true);
  });

  it("does not cancel a pull a worker is already running", async () => {
    const running = await testPrisma.ingestionRequest.create({
      data: { status: "RUNNING", claimedBy: "home-pc", claimedAt: new Date() },
    });

    const cancel = await request(app.getHttpServer()).post(`/v1/admin/ingestion/requests/${running.id}/cancel`);

    expect(cancel.status).toBe(409);
    expect((await testPrisma.ingestionRequest.findUniqueOrThrow({ where: { id: running.id } })).status).toBe("RUNNING");
  });

  it("reports queue mode and when a worker last checked in", async () => {
    const before = await request(app.getHttpServer()).get("/v1/admin/ingestion/schedule");
    expect(before.body).toMatchObject({ pullMode: "queue", ingestionAvailable: false, workerLastSeenAt: null });

    const lastSeenAt = new Date("2026-09-18T14:02:00.000Z");
    await testPrisma.ingestionWorker.create({ data: { name: "home-pc", lastSeenAt } });

    const after = await request(app.getHttpServer()).get("/v1/admin/ingestion/schedule");
    expect(after.body.workerLastSeenAt).toBe(lastSeenAt.toISOString());
  });

  it("keeps the queue behind admin access", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "someone", role: "USER" } } as never);

    const response = await request(app.getHttpServer()).get("/v1/admin/ingestion/requests");

    expect(response.status).toBe(403);
  });
});
