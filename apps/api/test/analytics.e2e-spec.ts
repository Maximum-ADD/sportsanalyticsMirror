import type { INestApplication } from "@nestjs/common";
import type { Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";

const MODEL_ACCURACY_PATH = "/v1/analytics/model-accuracy";
const LEADERBOARD_PATH = "/v1/analytics/leaderboard";
const ALL_BAND_LABELS = ["50-60", "60-70", "70-80", "80-90", "90-100"];

// The predictor writes its GamePrediction rows before tip-off, so the
// fixtures below date them a day earlier unless a test is specifically about
// a backfilled prediction.
const GAME_DATE = new Date("2026-01-10T00:00:00.000Z");
const BEFORE_TIP_OFF = new Date("2026-01-09T00:00:00.000Z");
const AFTER_FINAL_WHISTLE = new Date("2026-01-11T00:00:00.000Z");

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

interface GameFixture {
  nbaGameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

async function createGame(fixture: GameFixture): Promise<{ id: string }> {
  return testPrisma.game.create({
    data: {
      nbaGameId: fixture.nbaGameId,
      gameDate: GAME_DATE,
      season: "2025-26",
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    },
    select: { id: true },
  });
}

async function createPrediction(gameId: string, homeWinProbability: number, createdAt: Date): Promise<void> {
  await testPrisma.gamePrediction.create({
    data: {
      gameId,
      homeWinProbability,
      homeTeamEloPre: 1500,
      awayTeamEloPre: 1500,
      predictedMarginHome: 2,
      marginMethod: "heuristic",
      createdAt,
    },
  });
}

async function createUser(name: string, email: string): Promise<{ id: string }> {
  return testPrisma.user.create({ data: { name, email }, select: { id: true } });
}

// Records one graded call. The *AtPick snapshot is required by the schema, so
// it is filled with the same probability the prediction carries.
async function createPick(
  userId: string,
  gameId: string,
  pickedTeamId: string,
  outcome: "CORRECT" | "MISSED"
): Promise<void> {
  await testPrisma.gamePick.create({
    data: {
      userId,
      gameId,
      pickedTeamId,
      outcome,
      modelHomeWinProbabilityAtPick: 0.6,
      modelPredictedMarginAtPick: 2,
      homeTeamEloAtPick: 1500,
      awayTeamEloAtPick: 1500,
    },
  });
}

// Gives one user `callCount` graded calls, `correctCount` of them right, each
// on its own game so the @@unique([userId, gameId]) constraint is respected.
async function giveUserARecord(
  userId: string,
  homeTeamId: string,
  awayTeamId: string,
  callCount: number,
  correctCount: number,
  gameIdPrefix: string
): Promise<void> {
  for (let index = 0; index < callCount; index++) {
    const game = await createGame({
      nbaGameId: `${gameIdPrefix}-${index}`,
      homeTeamId,
      awayTeamId,
      homeScore: 110,
      awayScore: 100,
    });
    await createPick(userId, game.id, homeTeamId, index < correctCount ? "CORRECT" : "MISSED");
  }
}

describe("Analytics API", () => {
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

  describe(`GET ${MODEL_ACCURACY_PATH}`, () => {
    // The edge case for a deliberately public route: there is no 401 to
    // assert, so the real failure mode is an empty ledger. It must come back
    // as a well-formed 200 with honest nulls — never a divide-by-zero NaN, a
    // misleading 0, or a 404.
    it("returns a well-formed empty ledger when no game is evaluable yet", async () => {
      const response = await request(app.getHttpServer()).get(MODEL_ACCURACY_PATH);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accuracy: null,
        brierScore: null,
        homeBaselineAccuracy: null,
        gamesEvaluated: 0,
        forwardPredictionCount: 0,
        calibration: ALL_BAND_LABELS.map((band) => ({
          band,
          meanPredicted: null,
          actualWinRate: null,
          gamesInBand: 0,
        })),
      });
    });

    it("ignores finished games with no prediction and predicted games with no final score", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      await createGame({
        nbaGameId: "FINISHED-BUT-UNPREDICTED",
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        homeScore: 110,
        awayScore: 100,
      });
      const scheduledGame = await createGame({
        nbaGameId: "PREDICTED-BUT-UNPLAYED",
        homeTeamId: celtics.id,
        awayTeamId: lakers.id,
        homeScore: null,
        awayScore: null,
      });
      await createPrediction(scheduledGame.id, 0.7, BEFORE_TIP_OFF);

      const response = await request(app.getHttpServer()).get(MODEL_ACCURACY_PATH);

      expect(response.status).toBe(200);
      expect(response.body.gamesEvaluated).toBe(0);
      expect(response.body.accuracy).toBeNull();
    });

    it("scores the model over the games that have both a result and a prediction", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      // Home favourite at 0.75, home won: called correctly, predicted ahead
      // of tip-off. Brier term (0.75 - 1)^2 = 0.0625.
      const homeFavouriteWon = await createGame({
        nbaGameId: "HOME-FAVOURITE-WON",
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        homeScore: 110,
        awayScore: 100,
      });
      await createPrediction(homeFavouriteWon.id, 0.75, BEFORE_TIP_OFF);

      // Away favourite at 0.70 (home probability 0.30), home lost: also
      // called correctly, but written after the final whistle, so it does not
      // count as a forward prediction. Brier term (0.30 - 0)^2 = 0.09.
      const awayFavouriteWon = await createGame({
        nbaGameId: "AWAY-FAVOURITE-WON",
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        homeScore: 100,
        awayScore: 110,
      });
      await createPrediction(awayFavouriteWon.id, 0.3, AFTER_FINAL_WHISTLE);

      // Home favourite at 0.65, home lost: a miss. Brier term
      // (0.65 - 0)^2 = 0.4225.
      const homeFavouriteLost = await createGame({
        nbaGameId: "HOME-FAVOURITE-LOST",
        homeTeamId: celtics.id,
        awayTeamId: lakers.id,
        homeScore: 100,
        awayScore: 120,
      });
      await createPrediction(homeFavouriteLost.id, 0.65, BEFORE_TIP_OFF);

      const response = await request(app.getHttpServer()).get(MODEL_ACCURACY_PATH);

      expect(response.status).toBe(200);
      expect(response.body.gamesEvaluated).toBe(3);
      // Two of three called correctly.
      expect(response.body.accuracy).toBe(0.6667);
      // (0.0625 + 0.09 + 0.4225) / 3.
      expect(response.body.brierScore).toBe(0.1917);
      // The home team won only one of the three.
      expect(response.body.homeBaselineAccuracy).toBe(0.3333);
      expect(response.body.forwardPredictionCount).toBe(2);
    });

    it("returns all five calibration bands, bucketed on the favourite's probability", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });

      const homeFavouriteWon = await createGame({
        nbaGameId: "BAND-HOME-FAVOURITE",
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        homeScore: 110,
        awayScore: 100,
      });
      await createPrediction(homeFavouriteWon.id, 0.75, BEFORE_TIP_OFF);

      const awayFavouriteWon = await createGame({
        nbaGameId: "BAND-AWAY-FAVOURITE",
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        homeScore: 100,
        awayScore: 110,
      });
      await createPrediction(awayFavouriteWon.id, 0.3, BEFORE_TIP_OFF);

      const homeFavouriteLost = await createGame({
        nbaGameId: "BAND-HOME-FAVOURITE-LOST",
        homeTeamId: celtics.id,
        awayTeamId: lakers.id,
        homeScore: 100,
        awayScore: 120,
      });
      await createPrediction(homeFavouriteLost.id, 0.65, BEFORE_TIP_OFF);

      const response = await request(app.getHttpServer()).get(MODEL_ACCURACY_PATH);

      expect(response.status).toBe(200);
      expect(response.body.calibration).toHaveLength(ALL_BAND_LABELS.length);
      expect(response.body.calibration.map((band: { band: string }) => band.band)).toEqual(ALL_BAND_LABELS);

      const bandsByLabel = Object.fromEntries(
        response.body.calibration.map((band: { band: string }) => [band.band, band])
      );
      // The 0.75 home favourite and the 0.70 away favourite (home 0.30) both
      // land here: mean (0.75 + 0.70) / 2 = 0.725, and both favourites won.
      expect(bandsByLabel["70-80"]).toEqual({
        band: "70-80",
        meanPredicted: 0.725,
        actualWinRate: 1,
        gamesInBand: 2,
      });
      expect(bandsByLabel["60-70"]).toEqual({
        band: "60-70",
        meanPredicted: 0.65,
        actualWinRate: 0,
        gamesInBand: 1,
      });
      expect(bandsByLabel["90-100"].gamesInBand).toBe(0);
      expect(bandsByLabel["90-100"].meanPredicted).toBeNull();
    });

    // No SessionAuthGuard on this route by design, and supertest sends no
    // session cookie — so this request IS the signed-out case, and 200 is the
    // expected answer rather than the 401 a protected route would give.
    it("is public: an unauthenticated request gets the same ledger", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await createGame({
        nbaGameId: "PUBLIC-GAME",
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        homeScore: 110,
        awayScore: 100,
      });
      await createPrediction(game.id, 0.8, BEFORE_TIP_OFF);

      const response = await request(app.getHttpServer()).get(MODEL_ACCURACY_PATH);

      expect(response.status).toBe(200);
      expect(response.body.gamesEvaluated).toBe(1);
      expect(response.body.accuracy).toBe(1);
    });
  });

  describe(`GET ${LEADERBOARD_PATH}`, () => {
    it("ranks qualifying users and places the model among them", async () => {
      const home = await createTeam({ abbreviation: "LAL" });
      const away = await createTeam({ abbreviation: "BOS" });
      const sharp = await createUser("Sharp Caller", "sharp@example.com");
      const cold = await createUser("Cold Caller", "cold@example.com");

      await giveUserARecord(sharp.id, home.id, away.id, 10, 9, "sharp");
      await giveUserARecord(cold.id, home.id, away.id, 10, 2, "cold");

      const response = await request(app.getHttpServer()).get(LEADERBOARD_PATH);

      expect(response.status).toBe(200);
      expect(response.body.minimumCallsRequired).toBe(5);

      const names = response.body.entries.map((entry: { name: string }) => entry.name);
      expect(names).toContain("Sharp Caller");
      expect(names).toContain("Cold Caller");
      expect(names).toContain("Elo model");
      // 90% must outrank 20%.
      expect(names.indexOf("Sharp Caller")).toBeLessThan(names.indexOf("Cold Caller"));

      const sharpEntry = response.body.entries.find((entry: { name: string }) => entry.name === "Sharp Caller");
      expect(sharpEntry).toMatchObject({ kind: "user", calls: 10, correct: 9, hitRate: 0.9, rank: 1 });
    });

    // This route is public, so anything selected server-side is readable by a
    // signed-out visitor. Display names are intended; email addresses are not.
    it("never publishes an email address", async () => {
      const home = await createTeam({ abbreviation: "LAL" });
      const away = await createTeam({ abbreviation: "BOS" });
      const user = await createUser("Visible Name", "private@example.com");
      await giveUserARecord(user.id, home.id, away.id, 6, 4, "priv");

      const response = await request(app.getHttpServer()).get(LEADERBOARD_PATH);

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain("private@example.com");
      expect(JSON.stringify(response.body)).not.toContain("@");
    });

    it("excludes a user who has not called enough games to be judged", async () => {
      const home = await createTeam({ abbreviation: "LAL" });
      const away = await createTeam({ abbreviation: "BOS" });
      const rookie = await createUser("One Lucky Call", "rookie@example.com");
      // A perfect record over too few games must not top the board.
      await giveUserARecord(rookie.id, home.id, away.id, 1, 1, "rookie");

      const response = await request(app.getHttpServer()).get(LEADERBOARD_PATH);

      expect(response.status).toBe(200);
      const names = response.body.entries.map((entry: { name: string }) => entry.name);
      expect(names).not.toContain("One Lucky Call");
    });

    it("still returns the model when nobody has played", async () => {
      const home = await createTeam({ abbreviation: "LAL" });
      const away = await createTeam({ abbreviation: "BOS" });
      const game = await createGame({
        nbaGameId: "solo-model",
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: 110,
        awayScore: 100,
      });
      await createPrediction(game.id, 0.8, BEFORE_TIP_OFF);

      const response = await request(app.getHttpServer()).get(LEADERBOARD_PATH);

      expect(response.status).toBe(200);
      expect(response.body.entries).toHaveLength(1);
      expect(response.body.entries[0]).toMatchObject({ kind: "model", name: "Elo model", rank: 1 });
    });

    // The two analytics routes describe the same model; if they ever disagree
    // one of them is lying.
    it("reports the same model accuracy as the ledger does", async () => {
      const home = await createTeam({ abbreviation: "LAL" });
      const away = await createTeam({ abbreviation: "BOS" });
      const won = await createGame({ nbaGameId: "agree-1", homeTeamId: home.id, awayTeamId: away.id, homeScore: 110, awayScore: 100 });
      const lost = await createGame({ nbaGameId: "agree-2", homeTeamId: home.id, awayTeamId: away.id, homeScore: 95, awayScore: 100 });
      await createPrediction(won.id, 0.8, BEFORE_TIP_OFF);
      await createPrediction(lost.id, 0.8, BEFORE_TIP_OFF);

      const [ledger, leaderboard] = await Promise.all([
        request(app.getHttpServer()).get(MODEL_ACCURACY_PATH),
        request(app.getHttpServer()).get(LEADERBOARD_PATH),
      ]);

      const modelEntry = leaderboard.body.entries.find((entry: { kind: string }) => entry.kind === "model");
      expect(modelEntry.hitRate).toBe(ledger.body.accuracy);
      expect(modelEntry.calls).toBe(ledger.body.gamesEvaluated);
    });
  });

  describe("unknown analytics paths", () => {
    it("returns a 404 in the standard error envelope", async () => {
      const response = await request(app.getHttpServer()).get("/v1/analytics/not-a-report");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });
});
