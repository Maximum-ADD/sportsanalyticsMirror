import type { INestApplication } from "@nestjs/common";
import type { ProspectSeason, User } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";
import { ResponseCacheService } from "../src/cache/response-cache.service.js";
import type { ValuationModelBundle } from "../src/become-pro/valuation-model.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const OWNER_ID = "user-prospect-owner";
const OTHER_ID = "user-prospect-other";

// A clean, internally consistent line: 9-for-17 with 3 threes and 3 free
// throws is (9-3)*2 + 3*3 + 3 = 24 points.
function gameBody(overrides: Record<string, unknown> = {}) {
  return {
    gameDate: "2026-01-15",
    opponent: "Lincoln High",
    minutes: 32,
    points: 24,
    rebounds: 7,
    assists: 5,
    steals: 2,
    blocks: 1,
    turnovers: 3,
    fieldGoalsMade: 9,
    fieldGoalsAttempted: 17,
    threesMade: 3,
    threesAttempted: 7,
    freeThrowsMade: 3,
    freeThrowsAttempted: 4,
    ...overrides,
  };
}

async function createUser(id: string, username: string): Promise<User> {
  return testPrisma.user.create({ data: { id, name: username, email: `${id}@example.com`, username } });
}

function signInAs(userId: string): void {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: userId, role: "USER" } } as never);
}

function signOut(): void {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

async function createSeason(userId: string, overrides: Partial<ProspectSeason> = {}): Promise<ProspectSeason> {
  return testPrisma.prospectSeason.create({
    data: {
      userId,
      season: overrides.season ?? "2025-26",
      competitionLevel: overrides.competitionLevel ?? "NCAA_D1",
      position: overrides.position ?? "G",
      teamName: overrides.teamName ?? "Riverside College",
    },
  });
}

// Inserts games directly, bypassing the API — so no valuation runs. Use for
// fixtures; use logGamesViaApi when a test is about valuing.
async function insertGames(seasonId: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await testPrisma.prospectGame.create({
      data: {
        seasonId,
        gameDate: new Date(Date.UTC(2026, 0, index + 1)),
        opponent: `Opponent ${index}`,
        minutes: 32,
        points: 24,
        rebounds: 7,
        assists: 5,
        steals: 2,
        blocks: 1,
        turnovers: 3,
        fieldGoalsMade: 9,
        fieldGoalsAttempted: 17,
        threesMade: 3,
        threesAttempted: 7,
        freeThrowsMade: 3,
        freeThrowsAttempted: 4,
      },
    });
  }
}

let nextNbaId = 900_000;

// A real-shaped NBA rookie: a player drafted in `draftYear`, with the given
// games, so tests can prove which rows a comparable's line is built from.
async function seedRookie(options: {
  draftYear: number;
  draftNumber?: number;
  games: { season: string; seasonType?: "REGULAR" | "PLAYOFFS"; points: number; batchStatus?: "COMPLETED" | "PENDING_REVIEW" }[];
}) {
  nextNbaId += 10;
  const home = await testPrisma.team.create({
    data: { nbaTeamId: nextNbaId, name: "Home", abbreviation: `H${nextNbaId % 100}`, city: "Home", conference: "East", division: "Atlantic" },
  });
  const away = await testPrisma.team.create({
    data: { nbaTeamId: nextNbaId + 1, name: "Away", abbreviation: `A${nextNbaId % 100}`, city: "Away", conference: "West", division: "Pacific" },
  });
  const player = await testPrisma.player.create({
    data: {
      nbaPlayerId: nextNbaId + 2,
      firstName: "Rookie",
      lastName: `Comparable${nextNbaId}`,
      position: "G",
      teamId: home.id,
      draftYear: options.draftYear,
      draftRound: 1,
      draftNumber: options.draftNumber ?? 20,
    },
  });

  for (const [index, spec] of options.games.entries()) {
    const game = await testPrisma.game.create({
      data: {
        nbaGameId: `CMP-${nextNbaId}-${index}`,
        gameDate: new Date(Date.UTC(Number(spec.season.slice(0, 4)), 11, index + 1)),
        season: spec.season,
        seasonType: spec.seasonType ?? "REGULAR",
        homeTeamId: home.id,
        awayTeamId: away.id,
      },
    });
    if (spec.batchStatus) {
      await testPrisma.ingestionBatch.create({ data: { gameId: game.id, source: "nba_api", status: spec.batchStatus } });
    }
    await testPrisma.playerGameStat.create({
      data: {
        playerId: player.id,
        gameId: game.id,
        minutes: 30,
        points: spec.points,
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
  }
  return player;
}

// A trained model with an obvious rule — slot = intercept - 2 * points —
// written the way apps/valuation/train_valuation_model.py writes one.
async function trainModel(comparablePlayerIds: string[] = [], intercept = 60, fittedAt?: Date) {
  const firstRound: Record<string, number> = {};
  for (let pick = 1; pick <= 30; pick += 1) firstRound[String(pick)] = 13_000_000 - pick * 350_000;
  const bundle: ValuationModelBundle = {
    modelVersion: "prospect-value-2.0.0",
    featureNames: ["points_per_game", "rebounds_per_game", "assists_per_game", "true_shooting"],
    coefficients: [intercept, -2, 0, 0, 0],
    minimumGamesRequired: 10,
    slotBounds: { min: 1, max: 75 },
    rookieScale: { year: "2025-26", firstRoundPicks: 30, draftPicks: 60, firstRound, secondRoundValue: 600_000, undraftedValue: 85_000 },
    levelFactors: {
      NCAA_D1: { factor: 1, basis: "Division I is the reference level." },
      NCAA_D2: { factor: 0.5, basis: "Division II production is translated against Division I output." },
    },
    unknownLevelFactor: { factor: 0.15, basis: "This competition level is not recognised." },
    interval: { baseFraction: 0.28, shortLogGames: 25, shortLogExtraFraction: 0.15 },
    comparableIndex: comparablePlayerIds.map((playerId, index) => ({
      playerId,
      draftNumber: 20,
      features: [10 + index * 5, 5, 4, 55],
    })),
  };
  return testPrisma.prospectValuationModel.create({
    data: {
      modelVersion: bundle.modelVersion,
      bundle: bundle as unknown as object,
      trainingRows: 30,
      mae: 6.2,
      rankCorrelation: 0.61,
      ...(fittedAt ? { fittedAt } : {}),
    },
  });
}

describe("Become Pro", () => {
  let app: INestApplication;

  // Logs `count` valid 24-point games through the real API, so every one runs
  // the real valuation path.
  async function logGamesViaApi(seasonId: string, count: number, startDay = 1) {
    for (let index = 0; index < count; index += 1) {
      await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${seasonId}/games`)
        .send(gameBody({ gameDate: `2026-01-${String(startDay + index).padStart(2, "0")}`, opponent: `Team ${startDay + index}` }))
        .expect(201);
    }
  }

  // The trained model is cached briefly; tests that train a new one drop the
  // cache rather than waiting out the TTL.
  function forgetCachedModel() {
    app.get(ResponseCacheService).invalidate("become-pro-model");
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await createUser(OWNER_ID, "kiran");
    await createUser(OTHER_ID, "sam");
    signInAs(OWNER_ID);
    forgetCachedModel();
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  describe("privacy", () => {
    it("requires a session for every route", async () => {
      signOut();
      await request(app.getHttpServer()).get("/v1/me/become-pro").expect(401);
      await request(app.getHttpServer()).get("/v1/me/become-pro/summary").expect(401);
      await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025-26", competitionLevel: "NCAA_D1", position: "G" })
        .expect(401);
    });

    // Become Pro compares a user with NBA players, never with each other, so
    // there is nothing public to read — no board, no directory, no profiles.
    it("exposes no public leaderboard, directory or profile", async () => {
      signOut();
      await request(app.getHttpServer()).get("/v1/become-pro/leaderboard").expect(404);
      await request(app.getHttpServer()).get("/v1/become-pro/prospects").expect(404);
      await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(404);
    });

    it("shows a user only their own seasons", async () => {
      await createSeason(OTHER_ID, { season: "2024-25" });

      const response = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(response.body.seasons).toEqual([]);
    });

    // 404 rather than 403: another user's season id must be indistinguishable
    // from one that does not exist.
    it("will not open another user's season by id", async () => {
      const theirs = await createSeason(OTHER_ID);

      const response = await request(app.getHttpServer()).get(`/v1/me/become-pro?seasonId=${theirs.id}`).expect(404);

      expect(response.body.error.code).toBe("SEASON_NOT_FOUND");
    });

    it("will not log a game against another user's season", async () => {
      const theirs = await createSeason(OTHER_ID);

      await request(app.getHttpServer()).post(`/v1/me/become-pro/seasons/${theirs.id}/games`).send(gameBody()).expect(404);
    });

    it("will not delete another user's game", async () => {
      const theirs = await createSeason(OTHER_ID);
      await insertGames(theirs.id, 1);
      const game = await testPrisma.prospectGame.findFirstOrThrow({ where: { seasonId: theirs.id } });

      await request(app.getHttpServer()).delete(`/v1/me/become-pro/games/${game.id}`).expect(404);

      expect(await testPrisma.prospectGame.count({ where: { id: game.id } })).toBe(1);
    });
  });

  describe("starting a season", () => {
    // A brand-new user's own page is empty, not an error.
    it("returns an empty page before any season exists", async () => {
      const response = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(response.body.seasons).toEqual([]);
      expect(response.body.activeSeasonId).toBeNull();
      expect(response.body.valuation).toBeNull();
    });

    it("creates a season", async () => {
      const created = await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025-26", competitionLevel: "NCAA_D2", position: "G", teamName: "Riverside" })
        .expect(201);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      expect(page.body.activeSeasonId).toBe(created.body.id);
      expect(page.body.seasons[0].competitionLevel).toBe("NCAA_D2");
    });

    it("rejects a malformed league year", async () => {
      await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025", competitionLevel: "NCAA_D1", position: "G" })
        .expect(400);
    });

    it("refuses a second season for the same league year", async () => {
      await createSeason(OWNER_ID, { season: "2025-26" });

      const response = await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025-26", competitionLevel: "NCAA_D1", position: "F" })
        .expect(409);

      expect(response.body.error.code).toBe("SEASON_ALREADY_EXISTS");
    });

    it("deletes a season with its games", async () => {
      const season = await createSeason(OWNER_ID);
      await insertGames(season.id, 3);

      await request(app.getHttpServer()).delete(`/v1/me/become-pro/seasons/${season.id}`).expect(200);

      expect(await testPrisma.prospectGame.count({ where: { seasonId: season.id } })).toBe(0);
    });
  });

  describe("logging games", () => {
    it("derives the season line from the games logged", async () => {
      const season = await createSeason(OWNER_ID);
      await request(app.getHttpServer()).post(`/v1/me/become-pro/seasons/${season.id}/games`).send(gameBody()).expect(201);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.seasonAverages.gamesPlayed).toBe(1);
      expect(page.body.seasonAverages.pointsPerGame).toBe(24);
      expect(page.body.seasonAverages.fieldGoalPercentage).toBe(52.9);
    });

    // Absent, not zero — a zero would be a real measurement nobody made.
    it("returns null for the advanced figures an amateur sheet cannot carry", async () => {
      const season = await createSeason(OWNER_ID);
      await insertGames(season.id, 3);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.seasonAverages.plusMinusPerGame).toBeNull();
      expect(page.body.seasonAverages.usagePercentage).toBeNull();
      expect(page.body.seasonAverages.offensiveRating).toBeNull();
      expect(page.body.seasonAverages.defensiveRating).toBeNull();
    });

    it("rejects a box score that cannot be right", async () => {
      const season = await createSeason(OWNER_ID);

      const response = await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody({ fieldGoalsMade: 20, fieldGoalsAttempted: 3 }))
        .expect(400);

      expect(response.body.error.code).toBe("INVALID_BOX_SCORE");
    });

    // A real scoresheet sometimes disagrees with its own splits; refusing
    // somebody's own sheet is worse than recording it.
    it("accepts a line whose points disagree with its shooting splits", async () => {
      const season = await createSeason(OWNER_ID);

      await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody({ points: 22 }))
        .expect(201);
    });

    it("refuses the same game twice", async () => {
      const season = await createSeason(OWNER_ID);
      await request(app.getHttpServer()).post(`/v1/me/become-pro/seasons/${season.id}/games`).send(gameBody()).expect(201);

      const response = await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody())
        .expect(409);

      expect(response.body.error.code).toBe("DUPLICATE_GAME");
    });

    // A correction is checked against the merged row, not the patch alone.
    it("rejects a correction that breaks the rest of the line", async () => {
      const season = await createSeason(OWNER_ID);
      await insertGames(season.id, 1);
      const game = await testPrisma.prospectGame.findFirstOrThrow({ where: { seasonId: season.id } });

      await request(app.getHttpServer()).patch(`/v1/me/become-pro/games/${game.id}`).send({ fieldGoalsMade: 30 }).expect(400);
    });
  });

  describe("valuation on write", () => {
    it("values a season the moment its tenth game is logged", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID);

      await logGamesViaApi(season.id, 9);
      const before = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      expect(before.body.valuationState).toBe("BELOW_GAMES_FLOOR");
      expect(before.body.valuation).toBeNull();

      await logGamesViaApi(season.id, 1, 20);
      const after = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(after.body.valuationState).toBe("VALUED");
      // 60 - 2 * 24 = 12.
      expect(after.body.valuation.projectedDraftSlot).toBe(12);
      expect(after.body.valuation.projectedValueUsd).toBe(13_000_000 - 12 * 350_000);
      expect(after.body.valuation.projectedValueLowUsd).toBeLessThan(after.body.valuation.projectedValueUsd);
      expect(after.body.valuation.rookieScaleYear).toBe("2025-26");
    });

    // The system's gap must not read as the prospect's own shortfall.
    it("says a model has not been trained rather than showing nothing", async () => {
      const season = await createSeason(OWNER_ID);
      await insertGames(season.id, 12);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.valuationState).toBe("AWAITING_MODEL");
      expect(page.body.valuation).toBeNull();
    });

    it("re-values when the competition level changes", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID, { competitionLevel: "NCAA_D1" });
      await logGamesViaApi(season.id, 10);

      await request(app.getHttpServer())
        .patch(`/v1/me/become-pro/seasons/${season.id}`)
        .send({ competitionLevel: "NCAA_D2" })
        .expect(200);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      // D2 halves the 24 points to 12: 60 - 2 * 12 = 36 -> second round.
      expect(page.body.valuation.projectedDraftSlot).toBe(36);
      expect(page.body.valuation.projectedValueUsd).toBe(600_000);
      expect(page.body.valuation.levelFactor).toBe(0.5);
    });

    it("clears the figure when games are deleted back under the floor", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);
      const game = await testPrisma.prospectGame.findFirstOrThrow({ where: { seasonId: season.id } });

      await request(app.getHttpServer()).delete(`/v1/me/become-pro/games/${game.id}`).expect(200);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      expect(page.body.valuationState).toBe("BELOW_GAMES_FLOOR");
      expect(page.body.valuation).toBeNull();
    });

    // A newly trained model takes effect on the owner's next visit, with no
    // restart and no admin action.
    it("re-values against a newly trained model on the next read", async () => {
      await trainModel([], 60, new Date(Date.UTC(2020, 0, 1)));
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      await trainModel([], 70);
      forgetCachedModel();

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      // 70 - 2 * 24 = 22.
      expect(page.body.valuation.projectedDraftSlot).toBe(22);
    });

    // The sparkline shows movement, not a flat point for every typo fixed.
    it("records a new history point only when the figure changes", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);
      const game = await testPrisma.prospectGame.findFirstOrThrow({ where: { seasonId: season.id } });

      await request(app.getHttpServer())
        .patch(`/v1/me/become-pro/games/${game.id}`)
        .send({ opponent: "Renamed Opponent" })
        .expect(200);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      expect(page.body.valueHistory).toHaveLength(1);
    });

    // A game can change the explanation (here: efficiency, via free-throw
    // attempts) without changing the value. That is a new valuation row, but
    // not a new point on a line of the value.
    it("keeps a run of unchanged values as one history point", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody({ gameDate: "2026-01-20", opponent: "Team 20", freeThrowsAttempted: 8 }))
        .expect(201);

      expect(await testPrisma.prospectValuation.count({ where: { seasonId: season.id } })).toBe(2);
      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);
      expect(page.body.valueHistory).toHaveLength(1);
      const summary = await request(app.getHttpServer()).get("/v1/me/become-pro/summary").expect(200);
      expect(summary.body.valueHistory).toHaveLength(1);
    });
  });

  describe("NBA comparables", () => {
    // The model compares against a player's ROOKIE REGULAR SEASON, derived
    // from their draft year — a later season and a playoff game must both stay
    // out of the line the page plots beside the similarity score.
    it("builds a comparable's line from their rookie regular season only", async () => {
      const rookie = await seedRookie({
        draftYear: 2024,
        games: [
          { season: "2024-25", points: 10 },
          { season: "2024-25", seasonType: "PLAYOFFS", points: 40 },
          { season: "2025-26", points: 30 },
        ],
      });
      await trainModel([rookie.id]);
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      const [entry] = page.body.valuation.comparables;
      expect(entry.player.id).toBe(rookie.id);
      expect(entry.rookieSeason).toBe("2024-25");
      expect(entry.seasonAverages.gamesPlayed).toBe(1);
      expect(entry.seasonAverages.pointsPerGame).toBe(10);
    });

    // The same gate every other public PlayerGameStat read carries.
    it("keeps games from an unreviewed ingestion batch out of a comparable's line", async () => {
      const rookie = await seedRookie({
        draftYear: 2024,
        games: [
          { season: "2024-25", points: 10, batchStatus: "COMPLETED" },
          { season: "2024-25", points: 50, batchStatus: "PENDING_REVIEW" },
        ],
      });
      await trainModel([rookie.id]);
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.valuation.comparables[0].seasonAverages.pointsPerGame).toBe(10);
    });

    // A zeroed shape would read as a real, absurd rookie season.
    it("drops a comparable with no published rookie season", async () => {
      const rookie = await seedRookie({
        draftYear: 2024,
        games: [{ season: "2024-25", points: 10, batchStatus: "PENDING_REVIEW" }],
      });
      await trainModel([rookie.id]);
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.valuation.comparables).toEqual([]);
    });

    it("names players actually drafted at the projected slot", async () => {
      // 24 points projects to slot 12.
      const alumnus = await seedRookie({ draftYear: 2023, draftNumber: 12, games: [] });
      await trainModel();
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.valuation.slotAlumni[0].player.id).toBe(alumnus.id);
      expect(page.body.valuation.slotAlumni[0].draftYear).toBe(2023);
    });

    // The radar must plot the line the similarity was measured on.
    it("returns the level-adjusted line alongside the raw one", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID, { competitionLevel: "NCAA_D2" });
      await logGamesViaApi(season.id, 10);

      const page = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(page.body.seasonAverages.pointsPerGame).toBe(24);
      expect(page.body.valuation.levelAdjustedAverages.pointsPerGame).toBe(12);
      expect(page.body.valuation.levelAdjustedAverages.fieldGoalPercentage).toBe(
        page.body.seasonAverages.fieldGoalPercentage
      );
    });
  });

  describe("summary", () => {
    it("reports the latest season's value and its trend", async () => {
      await trainModel();
      const season = await createSeason(OWNER_ID);
      await logGamesViaApi(season.id, 10);

      const response = await request(app.getHttpServer()).get("/v1/me/become-pro/summary").expect(200);

      expect(response.body.valuationState).toBe("VALUED");
      expect(response.body.projectedDraftSlot).toBe(12);
      expect(response.body.gamesLogged).toBe(10);
      expect(response.body.valueHistory).toHaveLength(1);
    });

    it("is empty for a user who has not started", async () => {
      const response = await request(app.getHttpServer()).get("/v1/me/become-pro/summary").expect(200);

      expect(response.body.season).toBeNull();
      expect(response.body.projectedValueUsd).toBeNull();
    });
  });
});
