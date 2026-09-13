import type { INestApplication } from "@nestjs/common";
import type { Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";

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

describe("Teams API", () => {
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

  describe("GET /v1/teams", () => {
    it("returns an empty page when there are no teams", async () => {
      const response = await request(app.getHttpServer()).get("/v1/teams");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], page: 1, pageSize: 25, total: 0 });
    });

    it("returns teams ordered alphabetically by name, with pagination metadata", async () => {
      await createTeam({ nbaTeamId: 1, name: "Warriors", abbreviation: "GSW" });
      await createTeam({ nbaTeamId: 2, name: "Bucks", abbreviation: "MIL" });

      const response = await request(app.getHttpServer()).get("/v1/teams");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data.map((team: Team) => team.name)).toEqual(["Bucks", "Warriors"]);
    });

    it("respects page and pageSize query params", async () => {
      await createTeam({ nbaTeamId: 1, name: "Bucks" });
      await createTeam({ nbaTeamId: 2, name: "Celtics" });
      await createTeam({ nbaTeamId: 3, name: "Warriors" });

      const response = await request(app.getHttpServer()).get("/v1/teams?page=2&pageSize=2");

      expect(response.body.page).toBe(2);
      expect(response.body.pageSize).toBe(2);
      expect(response.body.total).toBe(3);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Warriors");
    });

    it("searches team city, name, and abbreviation case-insensitively", async () => {
      await createTeam({ nbaTeamId: 1, city: "Los Angeles", name: "Lakers", abbreviation: "LAL" });
      await createTeam({ nbaTeamId: 2, city: "Boston", name: "Celtics", abbreviation: "BOS" });

      const cityResponse = await request(app.getHttpServer()).get("/v1/teams?search=ANGE");
      const nameResponse = await request(app.getHttpServer()).get("/v1/teams?search=aker");
      const abbreviationResponse = await request(app.getHttpServer()).get("/v1/teams?search=lal");

      expect(cityResponse.body.data.map((team: Team) => team.name)).toEqual(["Lakers"]);
      expect(nameResponse.body.data.map((team: Team) => team.name)).toEqual(["Lakers"]);
      expect(abbreviationResponse.body.data.map((team: Team) => team.name)).toEqual(["Lakers"]);
    });

    it("matches full team names across city and name fields", async () => {
      await createTeam({ nbaTeamId: 1, city: "Los Angeles", name: "Lakers", abbreviation: "LAL" });
      await createTeam({ nbaTeamId: 2, city: "Los Angeles", name: "Clippers", abbreviation: "LAC" });

      const response = await request(app.getHttpServer()).get("/v1/teams?search=los%20ang%20lake");

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].name).toBe("Lakers");
    });

    it("paginates filtered team results and ignores blank search", async () => {
      await createTeam({ nbaTeamId: 1, city: "Los Angeles", name: "Lakers" });
      await createTeam({ nbaTeamId: 2, city: "Los Angeles", name: "Clippers" });
      await createTeam({ nbaTeamId: 3, city: "Los Angeles", name: "Stars" });

      const filteredResponse = await request(app.getHttpServer()).get("/v1/teams?search=los&page=2&pageSize=2");
      const blankResponse = await request(app.getHttpServer()).get("/v1/teams?search=%20%20");

      expect(filteredResponse.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(filteredResponse.body.data).toHaveLength(1);
      expect(blankResponse.body.total).toBe(3);
    });
  });

  describe("GET /v1/teams/:id", () => {
    it("returns the team when it exists", async () => {
      const team = await createTeam({ nbaTeamId: 99, name: "Celtics", abbreviation: "BOS" });

      const response = await request(app.getHttpServer()).get(`/v1/teams/${team.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: team.id, name: "Celtics", abbreviation: "BOS" });
    });

    it("returns a 404 with the standard error envelope when the team doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/teams/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Team not found" } });
    });
  });
});
