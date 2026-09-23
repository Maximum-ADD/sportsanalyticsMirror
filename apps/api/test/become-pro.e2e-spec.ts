import type { INestApplication } from "@nestjs/common";
import type { ProspectSeason, User } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const OWNER_ID = "user-prospect-owner";
const OTHER_ID = "user-prospect-other";
const ADMIN_ID = "user-prospect-admin";

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

async function createUser(id: string, username: string | null, role: "USER" | "ADMIN" = "USER"): Promise<User> {
  return testPrisma.user.create({
    data: { id, name: username ?? "No Name", email: `${id}@example.com`, username, role },
  });
}

// The session carries the role because RolesGuard reads it straight off
// request.user — in production BetterAuth puts it there as a custom field
// (see auth.config.ts), so the mock has to as well or every admin route 403s.
function signInAs(userId: string, role: "USER" | "ADMIN" = "USER"): void {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: userId, role } } as never);
}

function signOut(): void {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
}

async function createSeason(userId: string, overrides: Partial<ProspectSeason> = {}): Promise<ProspectSeason> {
  return testPrisma.prospectSeason.create({
    data: {
      userId,
      season: overrides.season ?? "2025-26",
      competitionLevel: overrides.competitionLevel ?? "NCAA_D2",
      position: overrides.position ?? "G",
      teamName: overrides.teamName ?? "Riverside College",
      isPublic: overrides.isPublic ?? true,
    },
  });
}

// Logs `count` internally consistent games on one day each, so the unique
// (seasonId, gameDate, opponent) index is never hit by the fixture itself.
async function logGames(seasonId: string, count: number, points = 24): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await testPrisma.prospectGame.create({
      data: {
        seasonId,
        gameDate: new Date(Date.UTC(2026, 0, index + 1)),
        opponent: `Opponent ${index}`,
        minutes: 32,
        points,
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

async function valueSeason(seasonId: string, valueUsd: number | null, slot: number | null = 18): Promise<void> {
  await testPrisma.prospectValuation.create({
    data: {
      seasonId,
      projectedDraftSlot: slot,
      projectedValueUsd: valueUsd,
      projectedValueLowUsd: valueUsd === null ? null : Math.round(valueUsd * 0.7),
      projectedValueHighUsd: valueUsd === null ? null : Math.round(valueUsd * 1.35),
      rookieScaleYear: "2025-26",
      levelFactor: 0.62,
      levelFactorBasis: "NCAA Division II production translated against D1 rookie output.",
      drivers: [{ label: "Scoring volume", detail: "24.0 points per game is top-decile for this level." }],
      comparablePlayerIds: [],
      comparableScores: [],
      slotAlumniPlayerIds: [],
      modelVersion: "test-1.0.0",
    },
  });
}

describe("Become Pro", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await createUser(OWNER_ID, "kiran");
    await createUser(OTHER_ID, "sam");
    await createUser(ADMIN_ID, "boss", "ADMIN");
    signOut();
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  describe("logging a season", () => {
    it("creates a season and derives its line from the games logged against it", async () => {
      signInAs(OWNER_ID);

      const created = await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025-26", competitionLevel: "NCAA_D2", position: "G" })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${created.body.id}/games`)
        .send(gameBody())
        .expect(201);

      const profile = await request(app.getHttpServer())
        .get("/v1/become-pro/prospects/kiran")
        .expect(200);

      expect(profile.body.seasonAverages.gamesPlayed).toBe(1);
      expect(profile.body.seasonAverages.pointsPerGame).toBe(24);
      // 9/17 from the field.
      expect(profile.body.seasonAverages.fieldGoalPercentage).toBe(52.9);
    });

    // The four figures a self-reported box score cannot carry must be absent,
    // not zero — a zero would be a real measurement nobody made.
    it("returns null for the advanced figures an amateur sheet cannot carry", async () => {
      signInAs(OWNER_ID);
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 3);

      const profile = await request(app.getHttpServer())
        .get("/v1/become-pro/prospects/kiran")
        .expect(200);

      expect(profile.body.seasonAverages.plusMinusPerGame).toBeNull();
      expect(profile.body.seasonAverages.usagePercentage).toBeNull();
      expect(profile.body.seasonAverages.offensiveRating).toBeNull();
      expect(profile.body.seasonAverages.defensiveRating).toBeNull();
    });

    it("rejects a box score that cannot be right", async () => {
      signInAs(OWNER_ID);
      const season = await createSeason(OWNER_ID);

      const response = await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody({ fieldGoalsMade: 20, fieldGoalsAttempted: 3 }))
        .expect(400);

      expect(response.body.error.code).toBe("INVALID_BOX_SCORE");
    });

    // A real scoresheet sometimes disagrees with its own splits; refusing
    // somebody's own sheet is worse than recording the disagreement.
    it("accepts a line whose points disagree with its shooting splits", async () => {
      signInAs(OWNER_ID);
      const season = await createSeason(OWNER_ID);

      await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody({ points: 22 }))
        .expect(201);
    });

    it("refuses the same game twice", async () => {
      signInAs(OWNER_ID);
      const season = await createSeason(OWNER_ID);
      await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody())
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody())
        .expect(409);

      expect(response.body.error.code).toBe("DUPLICATE_GAME");
    });

    it("refuses a second season for the same league year", async () => {
      signInAs(OWNER_ID);
      await createSeason(OWNER_ID, { season: "2025-26" });

      const response = await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025-26", competitionLevel: "NCAA_D1", position: "F" })
        .expect(409);

      expect(response.body.error.code).toBe("SEASON_ALREADY_EXISTS");
    });

    // The board keys on username, so an account without one cannot be ranked.
    it("refuses to log a season for an account with no username", async () => {
      const namelessId = "user-prospect-nameless";
      await createUser(namelessId, null);
      signInAs(namelessId);

      const response = await request(app.getHttpServer())
        .post("/v1/me/become-pro/seasons")
        .send({ season: "2025-26", competitionLevel: "REC", position: "G" })
        .expect(409);

      expect(response.body.error.code).toBe("USERNAME_REQUIRED");
    });
  });

  describe("ownership", () => {
    it("will not let one user log a game against another user's season", async () => {
      const season = await createSeason(OTHER_ID);
      signInAs(OWNER_ID);

      const response = await request(app.getHttpServer())
        .post(`/v1/me/become-pro/seasons/${season.id}/games`)
        .send(gameBody())
        .expect(404);

      // 404 rather than 403 on purpose: the error must not reveal that the
      // id is real but belongs to somebody else.
      expect(response.body.error.code).toBe("SEASON_NOT_FOUND");
    });

    it("will not let one user delete another user's game", async () => {
      const season = await createSeason(OTHER_ID);
      await logGames(season.id, 1);
      const game = await testPrisma.prospectGame.findFirstOrThrow({ where: { seasonId: season.id } });
      signInAs(OWNER_ID);

      await request(app.getHttpServer())
        .delete(`/v1/me/become-pro/games/${game.id}`)
        .expect(404);

      expect(await testPrisma.prospectGame.count({ where: { id: game.id } })).toBe(1);
    });

    it("marks a profile as the caller's own only for its owner", async () => {
      await createSeason(OWNER_ID);

      signInAs(OWNER_ID);
      const own = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);
      expect(own.body.isSelf).toBe(true);

      signInAs(OTHER_ID);
      const theirs = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);
      expect(theirs.body.isSelf).toBe(false);
    });

    it("hides a private season from everyone but its owner", async () => {
      await createSeason(OWNER_ID, { isPublic: false });

      signInAs(OTHER_ID);
      await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(404);

      signInAs(OWNER_ID);
      await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);
    });
  });

  describe("the value board", () => {
    it("is readable signed out", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 12);
      await valueSeason(season.id, 4_000_000);
      signOut();

      const response = await request(app.getHttpServer()).get("/v1/become-pro/leaderboard").expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].username).toBe("kiran");
    });

    it("keeps a season below the games floor off the board", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 5);
      await valueSeason(season.id, 9_000_000);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/leaderboard").expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.minimumGamesRequired).toBe(10);
    });

    it("ranks by projected value, highest first", async () => {
      const mine = await createSeason(OWNER_ID);
      const theirs = await createSeason(OTHER_ID);
      await logGames(mine.id, 12);
      await logGames(theirs.id, 12);
      await valueSeason(mine.id, 2_000_000);
      await valueSeason(theirs.id, 8_000_000);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/leaderboard").expect(200);

      expect(response.body.data.map((row: { username: string }) => row.username)).toEqual(["sam", "kiran"]);
      expect(response.body.data.map((row: { rank: number }) => row.rank)).toEqual([1, 2]);
    });

    it("carries the rookie-scale reference rows so a new board still reads", async () => {
      const response = await request(app.getHttpServer()).get("/v1/become-pro/leaderboard").expect(200);

      expect(response.body.references.length).toBeGreaterThan(0);
      expect(response.body.rookieScaleYear).toBeTruthy();
    });

    it("returns the caller's own standing even when it is off the page", async () => {
      const mine = await createSeason(OWNER_ID);
      const theirs = await createSeason(OTHER_ID);
      await logGames(mine.id, 12);
      await logGames(theirs.id, 12);
      await valueSeason(mine.id, 1_000_000);
      await valueSeason(theirs.id, 9_000_000);
      signInAs(OWNER_ID);

      const response = await request(app.getHttpServer())
        .get("/v1/become-pro/leaderboard?pageSize=1")
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].username).toBe("sam");
      expect(response.body.yourStanding.username).toBe("kiran");
      expect(response.body.yourStanding.rank).toBe(2);
    });
  });

  describe("the directory", () => {
    // The whole reason it exists: somebody below the floor is invisible on
    // the board but is still a person you can look up.
    it("lists a prospect who is nowhere near qualifying", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 2);

      const board = await request(app.getHttpServer()).get("/v1/become-pro/leaderboard").expect(200);
      const directory = await request(app.getHttpServer()).get("/v1/become-pro/prospects").expect(200);

      expect(board.body.data).toHaveLength(0);
      expect(directory.body.data).toHaveLength(1);
      expect(directory.body.data[0].rank).toBeNull();
    });
  });

  describe("rank state", () => {
    it("says a short season is below the games floor", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 4);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);

      expect(response.body.rankState).toBe("BELOW_GAMES_FLOOR");
      expect(response.body.rank).toBeNull();
      // No figure at all — never a zero.
      expect(response.body.valuation.projectedValueUsd).toBeNull();
    });

    // A qualified prospect waiting on the model must be distinguishable from
    // one who simply has not logged enough games.
    it("says a qualified but unvalued season is awaiting valuation", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 12);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);

      expect(response.body.rankState).toBe("AWAITING_VALUATION");
    });

    it("says a valued, qualified season is ranked", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 12);
      await valueSeason(season.id, 4_000_000);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);

      expect(response.body.rankState).toBe("RANKED");
      expect(response.body.rank).toBe(1);
    });
  });

  describe("the header rank summary", () => {
    it("reports the caller's standing and value history", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 12);
      await valueSeason(season.id, 3_000_000);
      await valueSeason(season.id, 4_000_000);
      signInAs(OWNER_ID);

      const response = await request(app.getHttpServer()).get("/v1/me/become-pro").expect(200);

      expect(response.body.rank).toBe(1);
      expect(response.body.projectedValueUsd).toBe(4_000_000);
      // Oldest first, so the sparkline reads left to right in time.
      expect(response.body.valueHistory.map((point: { valueUsd: number }) => point.valueUsd)).toEqual([
        3_000_000, 4_000_000,
      ]);
    });

    it("requires a session", async () => {
      signOut();
      await request(app.getHttpServer()).get("/v1/me/become-pro").expect(401);
    });
  });

  describe("verification", () => {
    async function uploadedEvidence(seasonId: string) {
      return testPrisma.prospectEvidence.create({
        data: {
          seasonId,
          fileName: "scoresheet.pdf",
          objectPath: `${OWNER_ID}/${seasonId}/doc.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
      });
    }

    it("counts a season with nothing uploaded as undocumented", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 10);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);

      expect(response.body.reliability.tier).toBe("UNDOCUMENTED");
      // A measured zero, not an absence — games ARE on record.
      expect(response.body.reliability.score).toBe(0);
    });

    it("raises reliability once an admin verifies a document", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 10);
      const evidence = await uploadedEvidence(season.id);
      await testPrisma.prospectGame.updateMany({
        where: { seasonId: season.id },
        data: { evidenceId: evidence.id },
      });

      signInAs(ADMIN_ID, "ADMIN");
      await request(app.getHttpServer())
        .patch(`/v1/admin/become-pro/evidence/${evidence.id}`)
        .send({ status: "VERIFIED" })
        .expect(200);

      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);
      expect(response.body.reliability.tier).toBe("STRONG");
      expect(response.body.reliability.gamesVerified).toBe(10);
    });

    it("shows a rejection reason verbatim", async () => {
      const season = await createSeason(OWNER_ID);
      const evidence = await uploadedEvidence(season.id);
      signInAs(ADMIN_ID, "ADMIN");

      await request(app.getHttpServer())
        .patch(`/v1/admin/become-pro/evidence/${evidence.id}`)
        .send({ status: "REJECTED", note: "The scan is unreadable." })
        .expect(200);

      signInAs(OWNER_ID);
      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);
      expect(response.body.evidence[0].reviewNote).toBe("The scan is unreadable.");
    });

    // Without this, reliability is farmable: log a modest game, get it
    // verified, then edit the numbers upward and keep the credit.
    it("clears a game's verification when its numbers are edited", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 1);
      const evidence = await uploadedEvidence(season.id);
      const game = await testPrisma.prospectGame.findFirstOrThrow({ where: { seasonId: season.id } });
      await testPrisma.prospectGame.update({ where: { id: game.id }, data: { evidenceId: evidence.id } });

      signInAs(OWNER_ID);
      await request(app.getHttpServer())
        .patch(`/v1/me/become-pro/games/${game.id}`)
        .send({ points: 40 })
        .expect(200);

      const after = await testPrisma.prospectGame.findFirstOrThrow({ where: { id: game.id } });
      expect(after.evidenceId).toBeNull();
    });

    // A scoresheet carries other people's names, so the public gets the
    // status and never the file.
    it("never hands a document's URL to somebody who does not own it", async () => {
      const season = await createSeason(OWNER_ID);
      await uploadedEvidence(season.id);

      signInAs(OTHER_ID);
      const response = await request(app.getHttpServer()).get("/v1/become-pro/prospects/kiran").expect(200);

      expect(response.body.evidence[0].fileUrl).toBeNull();
      expect(response.body.evidence[0].status).toBe("PENDING");
    });

    it("keeps the review queue to admins", async () => {
      signInAs(OWNER_ID);
      await request(app.getHttpServer()).get("/v1/admin/become-pro/evidence").expect(403);
    });

    it("lists pending uploads with their owner for an admin", async () => {
      const season = await createSeason(OWNER_ID);
      await uploadedEvidence(season.id);
      signInAs(ADMIN_ID, "ADMIN");

      const response = await request(app.getHttpServer())
        .get("/v1/admin/become-pro/evidence")
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].owner.username).toBe("kiran");
    });

    // Deleting a scoresheet stops it vouching for games; it must not delete
    // the games themselves.
    it("keeps the games when their document is removed", async () => {
      const season = await createSeason(OWNER_ID);
      await logGames(season.id, 3);
      const evidence = await uploadedEvidence(season.id);
      await testPrisma.prospectGame.updateMany({
        where: { seasonId: season.id },
        data: { evidenceId: evidence.id },
      });
      signInAs(OWNER_ID);

      await request(app.getHttpServer())
        .delete(`/v1/me/become-pro/evidence/${evidence.id}`)
        .expect(200);

      expect(await testPrisma.prospectGame.count({ where: { seasonId: season.id } })).toBe(3);
    });
  });
});
