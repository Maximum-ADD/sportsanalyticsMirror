import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";

// This is the stable, public HTTP surface clients may depend on. Updating it
// is an intentional API-contract change: reviewers can compare this compact
// list with the OpenAPI documentation before accepting the change.
type ApiContract = Record<string, Record<string, readonly string[]>>;

const publicApiContract: ApiContract = {
  "/health": { get: ["200"] },
  "/v1/players": { get: ["200"] },
  "/v1/players/{id}": { get: ["200", "404"] },
  "/v1/players/{id}/stats": { get: ["200", "404"] },
  "/v1/teams": { get: ["200"] },
  "/v1/teams/{id}": { get: ["200", "404"] },
  "/v1/games": { get: ["200"] },
  "/v1/games/{id}": { get: ["200", "404"] },
  "/v1/games/{id}/prediction": { get: ["200", "404"] },
};

describe("public OpenAPI contract", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("documents every stable public endpoint and its declared responses", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("NBA Analytics API").setVersion("1.0").build()
    );

    expect(document.paths).toMatchObject(
      Object.fromEntries(
        Object.entries(publicApiContract).map(([path, methods]) => [
          path,
          Object.fromEntries(
            Object.entries(methods).map(([method, responseStatuses]) => [
              method,
              { responses: Object.fromEntries(responseStatuses.map((status) => [status, expect.any(Object)])) },
            ])
          ),
        ])
      )
    );
  });
});
