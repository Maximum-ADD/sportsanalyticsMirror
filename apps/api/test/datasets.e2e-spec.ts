import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

describe("Datasets API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("GET /v1/datasets", () => {
    it("returns an empty page when no releases exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/datasets");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it("returns published releases ordered by publishedAt descending", async () => {
      const user = await testPrisma.user.create({
        data: {
          email: `admin-${uid()}@test.com`,
          name: "Admin",
          role: "ADMIN",
        },
      });

      await testPrisma.datasetRelease.create({
        data: {
          version: "2024-25.1",
          description: "First release",
          season: "2024-25",
          checksum: "abc123",
          gamesCount: 10,
          playersCount: 50,
          eventsCount: 500,
          fieldSchema: { columns: [] },
          publishedById: user.id,
        },
      });

      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1",
          description: "Second release",
          season: "2025-26",
          checksum: "def456",
          gamesCount: 20,
          playersCount: 60,
          eventsCount: 800,
          fieldSchema: { columns: [] },
          publishedById: user.id,
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/datasets");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data[0].version).toBe("2025-26.1");
      expect(response.body.data[1].version).toBe("2024-25.1");
    });
  });

  describe("GET /v1/datasets/:version", () => {
    it("returns a single release with its field schema", async () => {
      const user = await testPrisma.user.create({
        data: {
          email: `admin-${uid()}@test.com`,
          name: "Admin",
          role: "ADMIN",
        },
      });

      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1",
          description: "Initial release",
          season: "2025-26",
          checksum: "sha256hash",
          gamesCount: 10,
          playersCount: 50,
          eventsCount: 500,
          fieldSchema: { columns: ["playerId", "points"] },
          publishedById: user.id,
        },
      });

      const response = await request(app.getHttpServer()).get("/v1/datasets/2025-26.1");

      expect(response.status).toBe(200);
      expect(response.body.version).toBe("2025-26.1");
      expect(response.body.fieldSchema).toEqual({ columns: ["playerId", "points"] });
    });

    it("returns a 404 when the version doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/datasets/nonexistent");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /v1/datasets/:version/download", () => {
    it("returns a 404 when the version doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/datasets/nonexistent/download");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });
});
