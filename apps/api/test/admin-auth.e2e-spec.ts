import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { testPrisma } from "./test-db.js";

describe("Admin endpoints — unauthenticated access", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  it("GET /v1/admin/batches returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).get("/v1/admin/batches");
    expect(response.status).toBe(401);
  });

  it("GET /v1/admin/batches/:id returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).get("/v1/admin/batches/fake-id");
    expect(response.status).toBe(401);
  });

  it("POST /v1/admin/batches/:id/approve returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).post("/v1/admin/batches/fake-id/approve");
    expect(response.status).toBe(401);
  });

  it("POST /v1/admin/batches/:id/reject returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).post("/v1/admin/batches/fake-id/reject");
    expect(response.status).toBe(401);
  });

  it("GET /v1/admin/events/corrections returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).get("/v1/admin/events/corrections");
    expect(response.status).toBe(401);
  });

  it("GET /v1/admin/games/:gameId/corrections returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).get("/v1/admin/games/fake-id/corrections");
    expect(response.status).toBe(401);
  });

  it("POST /v1/admin/games/:gameId/events/:sequence/correct returns 401 without session", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/admin/games/fake-id/events/0/correct")
      .send({ description: "fix" });
    expect(response.status).toBe(401);
  });

  it("POST /v1/admin/games/:gameId/replay returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).post("/v1/admin/games/fake-id/replay");
    expect(response.status).toBe(401);
  });

  it("GET /v1/admin/games/:gameId/anomalies returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).get("/v1/admin/games/fake-id/anomalies");
    expect(response.status).toBe(401);
  });

  it("GET /v1/admin/consumers returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).get("/v1/admin/consumers");
    expect(response.status).toBe(401);
  });

  it("POST /v1/admin/consumers returns 401 without session", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/admin/consumers")
      .send({ name: "Test" });
    expect(response.status).toBe(401);
  });

  it("PATCH /v1/admin/consumers/:id returns 401 without session", async () => {
    const response = await request(app.getHttpServer())
      .patch("/v1/admin/consumers/fake-id")
      .send({ name: "Updated" });
    expect(response.status).toBe(401);
  });

  it("POST /v1/admin/consumers/:id/keys returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).post("/v1/admin/consumers/fake-id/keys");
    expect(response.status).toBe(401);
  });

  it("DELETE /v1/admin/consumers/:id/keys/:keyId returns 401 without session", async () => {
    const response = await request(app.getHttpServer()).delete("/v1/admin/consumers/fake-id/keys/fake-key");
    expect(response.status).toBe(401);
  });

  it("POST /v1/datasets/admin/publish returns 401 without session", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/datasets/admin/publish")
      .send({ version: "1.0", description: "test", season: "2025-26" });
    expect(response.status).toBe(401);
  });
});
