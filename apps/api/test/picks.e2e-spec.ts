import type { INestApplication } from "@nestjs/common";
import type { Game, GamePrediction, Team, User } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// Every route in this slice is scoped to request.user.id, and GamePick.userId
// is a real foreign key, so unlike the read-only specs these tests need an
// actual User row whose id the mocked session hands back.
const SIGNED_IN_USER_ID = "user-picks-1";

async function createSignedInUser(): Promise<User> {
  return testPrisma.user.create({
    data: { id: SIGNED_IN_USER_ID, name: "Pick Caller", email: "caller@example.com" },
  });
}

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

// A completed game. The home team wins 118-104 unless overridden, so the
// winner is unambiguous in every assertion below.
async function createGame(
  homeTeamId: string,
  awayTeamId: string,
  overrides: Partial<Game> = {}
): Promise<Game> {
  return testPrisma.game.create({
    data: {
      nbaGameId: overrides.nbaGameId ?? `MOCK-${Math.floor(Math.random() * 1_000_000)}`,
      gameDate: overrides.gameDate ?? new Date("2026-01-15"),
      season: overrides.season ?? "2025-26",
      homeTeamId,
      awayTeamId,
      homeScore: overrides.homeScore === undefined ? 118 : overrides.homeScore,
      awayScore: overrides.awayScore === undefined ? 104 : overrides.awayScore,
    },
  });
}

// The model favours the home team (0.63) unless overridden.
async function createPrediction(
  gameId: string,
  overrides: Partial<GamePrediction> = {}
): Promise<GamePrediction> {
  return testPrisma.gamePrediction.create({
    data: {
      gameId,
      homeWinProbability: overrides.homeWinProbability ?? 0.63,
      homeTeamEloPre: overrides.homeTeamEloPre ?? 1540.2,
      awayTeamEloPre: overrides.awayTeamEloPre ?? 1495.8,
      predictedMarginHome: overrides.predictedMarginHome ?? 4.5,
      marginMethod: overrides.marginMethod ?? "heuristic",
    },
  });
}

// The common fixture: a signed-in user and one completed, predicted game
// between two teams that the user has not called yet.
async function seedChallengeableGame() {
  const user = await createSignedInUser();
  const homeTeam = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
  const awayTeam = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS", city: "Boston" });
  const game = await createGame(homeTeam.id, awayTeam.id);
  const prediction = await createPrediction(game.id);
  return { user, homeTeam, awayTeam, game, prediction };
}

describe("Picks API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: SIGNED_IN_USER_ID, email: "caller@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("authentication", () => {
    it.each([
      ["get", "/v1/me/challenge/next"],
      ["get", "/v1/me/picks/record"],
      ["post", "/v1/me/picks"],
    ])("rejects a signed-out %s %s with 401", async (method, path) => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response =
        method === "post"
          ? await request(app.getHttpServer()).post(path).send({ gameId: "g", pickedTeamId: "t" })
          : await request(app.getHttpServer()).get(path);

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });
  });

  describe("GET /v1/me/challenge/next", () => {
    it("withholds the final score — the score keys must be absent, not merely null", async () => {
      const { game } = await seedChallengeableGame();

      const response = await request(app.getHttpServer()).get("/v1/me/challenge/next");

      expect(response.status).toBe(200);
      expect(response.body.gameId).toBe(game.id);
      // The point of the mechanic: the server knows the answer, the client
      // does not. `in` rather than a falsy check, because a null homeScore
      // would still be the score field, just emptied.
      expect("homeScore" in response.body).toBe(false);
      expect("awayScore" in response.body).toBe(false);
      // Pinned as an exact key set rather than a substring search of the
      // serialised body: team ids are uuids, whose hex can contain "118" or
      // "104" by chance, and this also fails loudly if a future column on
      // Game starts riding along in the payload.
      expect(Object.keys(response.body).sort()).toEqual([
        "awayTeam",
        "gameDate",
        "gameId",
        "homeTeam",
        "nbaGameId",
        "prediction",
        "season",
      ]);
    });

    it("returns the teams, the date, the season and the model's prediction", async () => {
      await seedChallengeableGame();

      const response = await request(app.getHttpServer()).get("/v1/me/challenge/next");

      expect(response.status).toBe(200);
      expect(response.body.season).toBe("2025-26");
      expect(response.body.gameDate).toContain("2026-01-15");
      expect(response.body.homeTeam.abbreviation).toBe("LAL");
      expect(response.body.awayTeam.abbreviation).toBe("BOS");
      expect(response.body.prediction).toEqual({
        homeWinProbability: 0.63,
        homeTeamEloPre: 1540.2,
        awayTeamEloPre: 1495.8,
        predictedMarginHome: 4.5,
        marginMethod: "heuristic",
      });
    });

    it("never offers a game this user has already called", async () => {
      const { game, homeTeam } = await seedChallengeableGame();
      await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: homeTeam.id })
        .expect(201);

      const response = await request(app.getHttpServer()).get("/v1/me/challenge/next");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("skips a completed game the predictor has no opinion on", async () => {
      await createSignedInUser();
      const homeTeam = await createTeam({ nbaTeamId: 1 });
      const awayTeam = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await createGame(homeTeam.id, awayTeam.id);

      const response = await request(app.getHttpServer()).get("/v1/me/challenge/next");

      expect(response.status).toBe(404);
    });

    it("skips a predicted game that has not been played yet", async () => {
      await createSignedInUser();
      const homeTeam = await createTeam({ nbaTeamId: 1 });
      const awayTeam = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await createGame(homeTeam.id, awayTeam.id, { homeScore: null, awayScore: null });
      await createPrediction(game.id);

      const response = await request(app.getHttpServer()).get("/v1/me/challenge/next");

      expect(response.status).toBe(404);
    });

    it("returns a 404 with the standard error envelope when nothing is left to call", async () => {
      await createSignedInUser();

      const response = await request(app.getHttpServer()).get("/v1/me/challenge/next");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(response.body.error.message).toContain("No challenge available");
    });
  });

  describe("POST /v1/me/picks", () => {
    it("stores a correct call, grades it, and releases the final score", async () => {
      const { game, homeTeam } = await seedChallengeableGame();

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: homeTeam.id });

      expect(response.status).toBe(201);
      expect(response.body.gameId).toBe(game.id);
      expect(response.body.pickedTeamId).toBe(homeTeam.id);
      expect(response.body.outcome).toBe("CORRECT");
      // The answer is released only now that the row exists.
      expect(response.body.finalScore).toEqual({
        homeScore: 118,
        awayScore: 104,
        winningTeamId: homeTeam.id,
      });
    });

    it("grades a call on the losing team MISSED", async () => {
      const { game, awayTeam } = await seedChallengeableGame();

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: awayTeam.id });

      expect(response.status).toBe(201);
      expect(response.body.outcome).toBe("MISSED");
    });

    it("copies the model's numbers into the pick and reports how the model itself did", async () => {
      const { game, homeTeam, awayTeam } = await seedChallengeableGame();

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: homeTeam.id });

      expect(response.status).toBe(201);
      expect(response.body.model).toEqual({
        homeWinProbability: 0.63,
        predictedMarginHome: 4.5,
        homeTeamElo: 1540.2,
        awayTeamElo: 1495.8,
        favoriteTeamId: homeTeam.id,
        outcome: "CORRECT",
      });
      expect(response.body.model.favoriteTeamId).not.toBe(awayTeam.id);

      // The snapshot is persisted, not just echoed — this is what keeps the
      // question answerable after predict_games.py overwrites GamePrediction.
      const stored = await testPrisma.gamePick.findFirstOrThrow({ where: { gameId: game.id } });
      expect(stored.modelHomeWinProbabilityAtPick).toBe(0.63);
      expect(stored.homeTeamEloAtPick).toBe(1540.2);
      expect(stored.awayTeamEloAtPick).toBe(1495.8);
      expect(stored.modelPredictedMarginAtPick).toBe(4.5);
    });

    it("rejects a second call on the same game with 409 CONFLICT", async () => {
      const { game, homeTeam, awayTeam } = await seedChallengeableGame();
      await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: homeTeam.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: awayTeam.id });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
      expect(response.body.error.message).toContain("already called this game");
      // The Prisma error must not leak through the envelope.
      expect(JSON.stringify(response.body)).not.toContain("P2002");

      // The first call stands; the second did not overwrite it.
      const storedPicks = await testPrisma.gamePick.findMany({ where: { gameId: game.id } });
      expect(storedPicks).toHaveLength(1);
      expect(storedPicks[0].pickedTeamId).toBe(homeTeam.id);
    });

    it("rejects a call on a team that is not playing in the game with 400", async () => {
      const { game } = await seedChallengeableGame();
      const uninvolvedTeam = await createTeam({ nbaTeamId: 3, name: "Heat", abbreviation: "MIA", city: "Miami" });

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: uninvolvedTeam.id });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toContain("two teams playing in this game");
      expect(await testPrisma.gamePick.count()).toBe(0);
    });

    it("rejects a malformed body with 400 naming the offending field", async () => {
      await seedChallengeableGame();

      const response = await request(app.getHttpServer()).post("/v1/me/picks").send({ gameId: "" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toContain("pickedTeamId");
    });

    it("returns 404 for a game that does not exist", async () => {
      const { homeTeam } = await seedChallengeableGame();

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: "no-such-game", pickedTeamId: homeTeam.id });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(response.body.error.message).toBe("Game not found");
    });

    it("returns 400 for a game the model has never predicted", async () => {
      await createSignedInUser();
      const homeTeam = await createTeam({ nbaTeamId: 1 });
      const awayTeam = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const unpredictedGame = await createGame(homeTeam.id, awayTeam.id);

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: unpredictedGame.id, pickedTeamId: homeTeam.id });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("no model prediction");
    });

    it("returns 403 for a cross-site write, without storing the call", async () => {
      const { game, homeTeam } = await seedChallengeableGame();

      const response = await request(app.getHttpServer())
        .post("/v1/me/picks")
        .set("Origin", "https://evil.example")
        .send({ gameId: game.id, pickedTeamId: homeTeam.id });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(await testPrisma.gamePick.count()).toBe(0);
    });
  });

  describe("GET /v1/me/picks/record", () => {
    it("returns a zeroed record for a user who has called nothing", async () => {
      await createSignedInUser();

      const response = await request(app.getHttpServer()).get("/v1/me/picks/record");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        wins: 0,
        losses: 0,
        total: 0,
        hitRate: 0,
        modelWins: 0,
        modelLosses: 0,
        modelHitRate: 0,
      });
    });

    it("scores the user and the model over exactly the games the user called", async () => {
      const user = await createSignedInUser();
      const homeTeam = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const awayTeam = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      // Game A: home wins, model favoured home. User calls home -> both right.
      const gameA = await createGame(homeTeam.id, awayTeam.id, { nbaGameId: "GAME-A" });
      await createPrediction(gameA.id, { homeWinProbability: 0.8 });

      // Game B: away wins, model still favoured home. User calls away, so the
      // user is right and the model is wrong — the user beats the model here.
      const gameB = await createGame(homeTeam.id, awayTeam.id, {
        nbaGameId: "GAME-B",
        homeScore: 95,
        awayScore: 108,
      });
      await createPrediction(gameB.id, { homeWinProbability: 0.8 });

      // Game C: a predicted, completed game this user never called. It must
      // not appear in either side of the record.
      const gameC = await createGame(homeTeam.id, awayTeam.id, { nbaGameId: "GAME-C" });
      await createPrediction(gameC.id, { homeWinProbability: 0.8 });

      await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: gameA.id, pickedTeamId: homeTeam.id })
        .expect(201);
      await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: gameB.id, pickedTeamId: awayTeam.id })
        .expect(201);

      const response = await request(app.getHttpServer()).get("/v1/me/picks/record");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        wins: 2,
        losses: 0,
        total: 2,
        hitRate: 1,
        modelWins: 1,
        modelLosses: 1,
        modelHitRate: 0.5,
      });
      expect(await testPrisma.gamePick.count({ where: { userId: user.id } })).toBe(2);
    });

    it("counts only the signed-in user's calls, not another user's", async () => {
      const { game, homeTeam, awayTeam } = await seedChallengeableGame();
      const otherUser = await testPrisma.user.create({
        data: { id: "user-picks-2", name: "Someone Else", email: "other@example.com" },
      });
      // The other user called the same game and got it wrong.
      await testPrisma.gamePick.create({
        data: {
          userId: otherUser.id,
          gameId: game.id,
          pickedTeamId: awayTeam.id,
          outcome: "MISSED",
          modelHomeWinProbabilityAtPick: 0.63,
          modelPredictedMarginAtPick: 4.5,
          homeTeamEloAtPick: 1540.2,
          awayTeamEloAtPick: 1495.8,
        },
      });

      await request(app.getHttpServer())
        .post("/v1/me/picks")
        .send({ gameId: game.id, pickedTeamId: homeTeam.id })
        .expect(201);

      const response = await request(app.getHttpServer()).get("/v1/me/picks/record");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.wins).toBe(1);
      expect(response.body.losses).toBe(0);
    });
  });
});
