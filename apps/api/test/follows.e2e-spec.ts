import type { INestApplication } from "@nestjs/common";
import type { Game, Player, Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// The id SessionAuthGuard will put on request.user. A real User row has to
// exist under it too: FollowedPlayer/FollowedTeam carry a foreign key to User,
// which is the point of scoping every follow to a real account.
const SIGNED_IN_USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

async function createUser(userId: string, email: string): Promise<void> {
  await testPrisma.user.create({ data: { id: userId, name: "Test User", email } });
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

async function createPlayer(teamId: string | null, overrides: Partial<Player> = {}): Promise<Player> {
  return testPrisma.player.create({
    data: {
      nbaPlayerId: overrides.nbaPlayerId ?? Math.floor(Math.random() * 1_000_000),
      firstName: overrides.firstName ?? "LeBron",
      lastName: overrides.lastName ?? "James",
      position: overrides.position ?? "F",
      teamId,
    },
  });
}

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
      homeScore: overrides.homeScore === undefined ? 110 : overrides.homeScore,
      awayScore: overrides.awayScore === undefined ? 105 : overrides.awayScore,
    },
  });
}

// A boxscore line for one player in one game. Only the three columns the
// watchlist averages read are parameterised; the rest are fixed, since
// PlayerGameStat has no nullable counting columns.
async function createBoxscore(
  playerId: string,
  gameId: string,
  scoringLine: { points: number; rebounds: number; assists: number }
): Promise<void> {
  await testPrisma.playerGameStat.create({
    data: {
      playerId,
      gameId,
      minutes: 32,
      steals: 1,
      blocks: 1,
      turnovers: 2,
      fieldGoalsMade: 8,
      fieldGoalsAttempted: 16,
      threesMade: 2,
      threesAttempted: 5,
      freeThrowsMade: 4,
      freeThrowsAttempted: 5,
      ...scoringLine,
    },
  });
}

describe("Follows API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: SIGNED_IN_USER_ID, email: "player@example.com" },
    } as never);
    await createUser(SIGNED_IN_USER_ID, "player@example.com");
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
    await app.close();
  });

  describe("authentication", () => {
    // Every route in the module, read and write, is behind SessionAuthGuard.
    const protectedRoutes: Array<[string, string]> = [
      ["get", "/v1/me/watchlist"],
      ["get", "/v1/me/teams/results"],
      ["post", "/v1/me/follows/players/player-1"],
      ["patch", "/v1/me/follows/players/player-1"],
      ["delete", "/v1/me/follows/players/player-1"],
      ["put", "/v1/me/follows/teams/team-1"],
      ["delete", "/v1/me/follows/teams/team-1"],
    ];

    it.each(protectedRoutes)("rejects a signed-out %s %s with 401", async (method, path) => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())[method as "get"](path).send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Sign in required" });
    });
  });

  describe("POST /v1/me/follows/players/:playerId", () => {
    it("starts following a player and returns the follow", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);

      const response = await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ playerId: player.id, note: null });
      expect(response.body.followedAt).toBeDefined();
      await expect(
        testPrisma.followedPlayer.count({ where: { userId: SIGNED_IN_USER_ID } })
      ).resolves.toBe(1);
    });

    // The follow button must survive a double-tap, and a retried request must
    // not blow up on the unique constraint.
    it("is idempotent - following twice leaves exactly one follow", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);

      const firstResponse = await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      const secondResponse = await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);
      await expect(
        testPrisma.followedPlayer.count({ where: { userId: SIGNED_IN_USER_ID, playerId: player.id } })
      ).resolves.toBe(1);
    });

    it("does not wipe an existing note when the follow is repeated", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({ note: "Watch the third quarter minutes" });

      const response = await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      expect(response.body.note).toBe("Watch the third quarter minutes");
    });

    it("returns a 404 with the standard error envelope for an unknown player", async () => {
      const response = await request(app.getHttpServer()).post("/v1/me/follows/players/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Player not found" });
      await expect(testPrisma.followedPlayer.count()).resolves.toBe(0);
    });

    // OriginCheckGuard is global and applies to every write route here.
    it("returns a 403 for a write from an untrusted Origin", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);

      const response = await request(app.getHttpServer())
        .post(`/v1/me/follows/players/${player.id}`)
        .set("Origin", "https://evil.example");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("PATCH /v1/me/follows/players/:playerId", () => {
    it("updates only the scouting note", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      const response = await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({ note: "Elite rim pressure since the trade" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        playerId: player.id,
        note: "Elite rim pressure since the trade",
      });
    });

    it("clears the note when given null", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({ note: "Temporary" });

      const response = await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({ note: null });

      expect(response.status).toBe(200);
      expect(response.body.note).toBeNull();
    });

    it("returns a 400 when the body has no note field", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      const response = await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toContain("note");
    });

    // Writing a note is not a back door to following someone.
    it("returns a 404 when the user does not follow the player", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);

      const response = await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({ note: "Never followed them" });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe("You are not following this player");
    });
  });

  describe("DELETE /v1/me/follows/players/:playerId", () => {
    it("unfollows a player", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      const response = await request(app.getHttpServer()).delete(`/v1/me/follows/players/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ playerId: player.id, removed: true });
      await expect(testPrisma.followedPlayer.count()).resolves.toBe(0);
    });

    it("reports removed: false rather than erroring when there was no follow", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);

      const response = await request(app.getHttpServer()).delete(`/v1/me/follows/players/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ playerId: player.id, removed: false });
    });

    it("cannot delete another user's follow", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await createUser(OTHER_USER_ID, "other@example.com");
      await testPrisma.followedPlayer.create({ data: { userId: OTHER_USER_ID, playerId: player.id } });

      const response = await request(app.getHttpServer()).delete(`/v1/me/follows/players/${player.id}`);

      expect(response.body.removed).toBe(false);
      await expect(
        testPrisma.followedPlayer.count({ where: { userId: OTHER_USER_ID } })
      ).resolves.toBe(1);
    });
  });

  describe("GET /v1/me/watchlist", () => {
    it("returns an empty page for a user following nobody", async () => {
      const response = await request(app.getHttpServer()).get("/v1/me/watchlist");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], page: 1, pageSize: 25, total: 0 });
    });

    it("shows a followed player with season averages derived from their boxscores", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer(lakers.id, { firstName: "LeBron", lastName: "James" });
      const earlierGame = await createGame(lakers.id, celtics.id, {
        nbaGameId: "WATCH-EARLIER",
        gameDate: new Date("2026-01-01"),
      });
      const laterGame = await createGame(lakers.id, celtics.id, {
        nbaGameId: "WATCH-LATER",
        gameDate: new Date("2026-01-05"),
      });
      await createBoxscore(player.id, earlierGame.id, { points: 30, rebounds: 10, assists: 7 });
      await createBoxscore(player.id, laterGame.id, { points: 21, rebounds: 5, assists: 4 });

      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      const response = await request(app.getHttpServer()).get("/v1/me/watchlist");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      const [entry] = response.body.data;
      expect(entry.player).toMatchObject({ id: player.id, lastName: "James" });
      expect(entry.player.team).toMatchObject({ abbreviation: "LAL" });
      // The nba.com ids ride alongside our uuids because the frontend builds
      // headshot and crest URLs from them (apps/web/src/lib/nbaMedia.ts).
      // Without these the board can only draw initials and a coloured badge
      // where the rest of the app shows real art.
      expect(entry.player.nbaPlayerId).toBe(player.nbaPlayerId);
      expect(entry.player.team.nbaTeamId).toBe(lakers.nbaTeamId);
      expect(entry.seasonAverages).toEqual({
        gamesPlayed: 2,
        pointsPerGame: 25.5,
        reboundsPerGame: 7.5,
        assistsPerGame: 5.5,
      });
      // Most recent game first.
      expect(entry.recentPoints.map((game: { points: number }) => game.points)).toEqual([21, 30]);
      expect(entry.recentPoints[0].gameId).toBe(laterGame.id);
    });

    it("shows a followed player with no games as zeroes rather than omitting them", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist");

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].seasonAverages).toEqual({
        gamesPlayed: 0,
        pointsPerGame: 0,
        reboundsPerGame: 0,
        assistsPerGame: 0,
      });
      expect(response.body.data[0].recentPoints).toEqual([]);
    });

    it("carries the user's own note onto the board", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      await request(app.getHttpServer())
        .patch(`/v1/me/follows/players/${player.id}`)
        .send({ note: "Second-unit minutes trending up" });

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist");

      expect(response.body.data[0].note).toBe("Second-unit minutes trending up");
    });

    it("never shows another user's follows", async () => {
      const lakers = await createTeam();
      const mine = await createPlayer(lakers.id, { nbaPlayerId: 11, lastName: "Mine" });
      const theirs = await createPlayer(lakers.id, { nbaPlayerId: 22, lastName: "Theirs" });
      await createUser(OTHER_USER_ID, "other@example.com");
      await testPrisma.followedPlayer.create({ data: { userId: OTHER_USER_ID, playerId: theirs.id } });
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${mine.id}`);

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist");

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].player.lastName).toBe("Mine");
    });

    it("lists just the followed ids for a follow button elsewhere in the app", async () => {
      const lakers = await createTeam();
      const followed = await createPlayer(lakers.id, { nbaPlayerId: 31, lastName: "Followed" });
      const ignored = await createPlayer(lakers.id, { nbaPlayerId: 32, lastName: "Ignored" });
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${followed.id}`);

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist/ids");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ playerIds: [followed.id] });
      expect(response.body.playerIds).not.toContain(ignored.id);
    });

    // The id list is what a follow button renders from, so leaking another
    // user's follows into it would put their watchlist on someone else's
    // screen just as surely as leaking the board would.
    it("never lists another user's followed ids", async () => {
      const lakers = await createTeam();
      const theirs = await createPlayer(lakers.id);
      await createUser(OTHER_USER_ID, "other@example.com");
      await testPrisma.followedPlayer.create({ data: { userId: OTHER_USER_ID, playerId: theirs.id } });

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist/ids");

      expect(response.body).toEqual({ playerIds: [] });
    });

    it("drops a player off the board once unfollowed", async () => {
      const lakers = await createTeam();
      const player = await createPlayer(lakers.id);
      await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      await request(app.getHttpServer()).delete(`/v1/me/follows/players/${player.id}`);

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist");

      expect(response.body).toEqual({ data: [], page: 1, pageSize: 25, total: 0 });
    });

    it("respects page and pageSize", async () => {
      const lakers = await createTeam();
      for (let playerIndex = 0; playerIndex < 3; playerIndex++) {
        const player = await createPlayer(lakers.id, { nbaPlayerId: 100 + playerIndex });
        await request(app.getHttpServer()).post(`/v1/me/follows/players/${player.id}`);
      }

      const response = await request(app.getHttpServer()).get("/v1/me/watchlist?page=2&pageSize=2");

      expect(response.body.page).toBe(2);
      expect(response.body.pageSize).toBe(2);
      expect(response.body.total).toBe(3);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe("PUT /v1/me/follows/teams/:teamId", () => {
    it("follows a team, defaulting isPrimary to false when the body omits it", async () => {
      const lakers = await createTeam();

      const response = await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({});

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ teamId: lakers.id, isPrimary: false });
    });

    it("is idempotent - repeating the same PUT leaves one follow in the same state", async () => {
      const lakers = await createTeam();

      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({ isPrimary: true });
      const secondResponse = await request(app.getHttpServer())
        .put(`/v1/me/follows/teams/${lakers.id}`)
        .send({ isPrimary: true });

      expect(secondResponse.body.isPrimary).toBe(true);
      await expect(testPrisma.followedTeam.count({ where: { userId: SIGNED_IN_USER_ID } })).resolves.toBe(1);
    });

    // The invariant Prisma's schema cannot state: at most one primary team per
    // user. Promoting team B must demote team A in the same transaction.
    it("keeps at most one primary team - promoting a second demotes the first", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({ isPrimary: true });

      const response = await request(app.getHttpServer())
        .put(`/v1/me/follows/teams/${celtics.id}`)
        .send({ isPrimary: true });

      expect(response.body).toMatchObject({ teamId: celtics.id, isPrimary: true });
      const followsByTeamId = await testPrisma.followedTeam.findMany({
        where: { userId: SIGNED_IN_USER_ID },
      });
      expect(followsByTeamId).toHaveLength(2);
      expect(followsByTeamId.find((follow) => follow.teamId === lakers.id)?.isPrimary).toBe(false);
      expect(followsByTeamId.find((follow) => follow.teamId === celtics.id)?.isPrimary).toBe(true);
    });

    it("does not demote another user's primary team", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await createUser(OTHER_USER_ID, "other@example.com");
      await testPrisma.followedTeam.create({
        data: { userId: OTHER_USER_ID, teamId: lakers.id, isPrimary: true },
      });

      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${celtics.id}`).send({ isPrimary: true });

      const otherUsersFollow = await testPrisma.followedTeam.findFirst({
        where: { userId: OTHER_USER_ID },
      });
      expect(otherUsersFollow?.isPrimary).toBe(true);
    });

    it("returns a 400 when isPrimary is not a boolean", async () => {
      const lakers = await createTeam();

      const response = await request(app.getHttpServer())
        .put(`/v1/me/follows/teams/${lakers.id}`)
        .send({ isPrimary: "yes" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toContain("isPrimary");
    });

    it("returns a 404 for an unknown team", async () => {
      const response = await request(app.getHttpServer())
        .put("/v1/me/follows/teams/does-not-exist")
        .send({ isPrimary: true });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Team not found" });
    });
  });

  describe("DELETE /v1/me/follows/teams/:teamId", () => {
    it("unfollows a team", async () => {
      const lakers = await createTeam();
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({ isPrimary: true });

      const response = await request(app.getHttpServer()).delete(`/v1/me/follows/teams/${lakers.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ teamId: lakers.id, removed: true });
      await expect(testPrisma.followedTeam.count()).resolves.toBe(0);
    });

    it("reports removed: false rather than erroring when there was no follow", async () => {
      const lakers = await createTeam();

      const response = await request(app.getHttpServer()).delete(`/v1/me/follows/teams/${lakers.id}`);

      expect(response.body).toEqual({ teamId: lakers.id, removed: false });
    });
  });

  describe("GET /v1/me/teams/results", () => {
    it("returns an empty feed for a user following no teams", async () => {
      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [] });
    });

    it("orients a home win to the followed team", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await createGame(lakers.id, celtics.id, { homeScore: 110, awayScore: 105 });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({});

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        gameId: game.id,
        yourScore: 110,
        opponentScore: 105,
        won: true,
        playedAtHome: true,
        modelCall: null,
      });
      expect(response.body.data[0].yourTeam.abbreviation).toBe("LAL");
      expect(response.body.data[0].opponent.abbreviation).toBe("BOS");
    });

    // Same stored row, other bench: this is what /v1/games could not give the
    // frontend without making it do the flipping itself.
    it("orients the same game as an away loss for the other team's follower", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await createGame(lakers.id, celtics.id, { homeScore: 110, awayScore: 105 });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${celtics.id}`).send({});

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.body.data[0]).toMatchObject({
        yourScore: 105,
        opponentScore: 110,
        won: false,
        playedAtHome: false,
      });
      expect(response.body.data[0].yourTeam.abbreviation).toBe("BOS");
    });

    it("flips the model's call onto the followed team's side and scores it", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const game = await createGame(lakers.id, celtics.id, { homeScore: 110, awayScore: 105 });
      await testPrisma.gamePrediction.create({
        data: {
          gameId: game.id,
          homeWinProbability: 0.58,
          homeTeamEloPre: 1505,
          awayTeamEloPre: 1495,
          predictedMarginHome: 4.5,
          marginMethod: "heuristic",
        },
      });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${celtics.id}`).send({});

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      // Celtics were away and lost; the model gave the home side 58%, so from
      // Boston's side that is a 42% call against them, which came true.
      expect(response.body.data[0].modelCall).toEqual({
        predictedWinner: "OPPONENT",
        yourTeamWinProbability: 0.42,
        predictedMarginInPoints: -4.5,
        marginMethod: "heuristic",
        wasCorrect: true,
      });
    });

    it("excludes games that have not been played yet", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      const playedGame = await createGame(lakers.id, celtics.id, {
        nbaGameId: "PLAYED",
        gameDate: new Date("2026-01-01"),
      });
      await createGame(lakers.id, celtics.id, {
        nbaGameId: "SCHEDULED",
        gameDate: new Date("2026-03-01"),
        homeScore: null,
        awayScore: null,
      });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({});

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].gameId).toBe(playedGame.id);
    });

    it("returns the most recent games first", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await createGame(lakers.id, celtics.id, { nbaGameId: "OLDER", gameDate: new Date("2026-01-01") });
      await createGame(celtics.id, lakers.id, { nbaGameId: "NEWER", gameDate: new Date("2026-02-01") });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({});

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.body.data.map((result: { nbaGameId: string }) => result.nbaGameId)).toEqual([
        "NEWER",
        "OLDER",
      ]);
      // The Lakers were away in the newer game, so it is oriented that way.
      expect(response.body.data[0].playedAtHome).toBe(false);
    });

    it("shows a game once, from the primary team's side, when both teams are followed", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await createGame(lakers.id, celtics.id, { homeScore: 110, awayScore: 105 });
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${lakers.id}`).send({});
      await request(app.getHttpServer()).put(`/v1/me/follows/teams/${celtics.id}`).send({ isPrimary: true });

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].yourTeam.abbreviation).toBe("BOS");
      expect(response.body.data[0].won).toBe(false);
    });

    it("never shows games for another user's followed teams", async () => {
      const lakers = await createTeam({ nbaTeamId: 1, abbreviation: "LAL" });
      const celtics = await createTeam({ nbaTeamId: 2, name: "Celtics", abbreviation: "BOS" });
      await createGame(lakers.id, celtics.id);
      await createUser(OTHER_USER_ID, "other@example.com");
      await testPrisma.followedTeam.create({ data: { userId: OTHER_USER_ID, teamId: lakers.id } });

      const response = await request(app.getHttpServer()).get("/v1/me/teams/results");

      expect(response.body).toEqual({ data: [] });
    });
  });
});
