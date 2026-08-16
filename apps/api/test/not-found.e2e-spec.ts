import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";

describe("unmatched routes", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns a 404 with the standard error envelope for an unknown path", async () => {
    const response = await request(app.getHttpServer()).get("/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "NOT_FOUND", message: "No route for GET /v1/does-not-exist" },
    });
  });

  it("applies the catch-all to non-GET methods too", async () => {
    const response = await request(app.getHttpServer()).post("/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("No route for POST /v1/does-not-exist");
  });
});
