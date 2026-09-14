import type { INestApplication } from "@nestjs/common";
import type { SeasonType } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";

let nextId = 0;
function uniqueId() {
  nextId += 1;
  return nextId;
}

async function createTeam(overrides: Partial<{ name: string; abbreviation: string }> = {}) {
  return testPrisma.team.create({
    data: {
      nbaTeamId: uniqueId(),
      name: overrides.name ?? "Lakers",
      abbreviation: overrides.abbreviation ?? "LAL",
      city: "Los Angeles",
      conference: "West",
      division: "Pacific",
    },
  });
}

async function createPlayer(overrides: {
  teamId?: string | null;
  firstName?: string;
  lastName?: string;
  position?: string;
}) {
  return testPrisma.player.create({
    data: {
      nbaPlayerId: uniqueId(),
      firstName: overrides.firstName ?? "LeBron",
      lastName: overrides.lastName ?? "James",
      position: overrides.position ?? "F",
      teamId: overrides.teamId ?? null,
    },
  });
}

async function createGame(
  homeTeamId: string,
  awayTeamId: string,
  gameDate: Date,
  seasonType: SeasonType = "REGULAR",
  playoffRound: number | null = null
) {
  return testPrisma.game.create({
    data: {
      nbaGameId: `MOCK-${uniqueId()}`,
      gameDate,
      season: "2025-26",
      seasonType,
      playoffRound,
      homeTeamId,
      awayTeamId,
    },
  });
}

async function createGameStat(
  playerId: string,
  gameId: string,
  overrides: Partial<{
    points: number;
    rebounds: number;
    assists: number;
    fieldGoalsAttempted: number;
    freeThrowsAttempted: number;
  }> = {}
) {
  return testPrisma.playerGameStat.create({
    data: {
      playerId,
      gameId,
      minutes: 30,
      points: overrides.points ?? 20,
      rebounds: overrides.rebounds ?? 5,
      assists: overrides.assists ?? 4,
      steals: 1,
      blocks: 1,
      turnovers: 2,
      fieldGoalsMade: 8,
      fieldGoalsAttempted: overrides.fieldGoalsAttempted ?? 16,
      threesMade: 2,
      threesAttempted: 5,
      freeThrowsMade: 2,
      freeThrowsAttempted: overrides.freeThrowsAttempted ?? 2,
    },
  });
}

// Gives one player `gameCount` games in one segment, every boxscore row
// identical, so the derived averages equal the per-game line exactly —
// a 30-point line over 15 games derives to a 30.0 PPG average.
async function seedGamesForPlayer(
  playerId: string,
  homeTeamId: string,
  awayTeamId: string,
  gameCount: number,
  seasonType: SeasonType,
  statLine: Parameters<typeof createGameStat>[2]
) {
  for (let gameIndex = 0; gameIndex < gameCount; gameIndex++) {
    const game = await createGame(
      homeTeamId,
      awayTeamId,
      new Date(Date.UTC(2025, 9, 15 + gameIndex)),
      seasonType
    );
    await createGameStat(playerId, game.id, statLine);
  }
}

describe("Players API", () => {
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

  describe("GET /v1/players", () => {
    it("returns players with their team embedded, ordered by last name", async () => {
      const team = await createTeam();
      await createPlayer({ teamId: team.id, firstName: "Steph", lastName: "Curry" });
      await createPlayer({ teamId: team.id, firstName: "LeBron", lastName: "James" });

      const response = await request(app.getHttpServer()).get("/v1/players");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data.map((p: { lastName: string }) => p.lastName)).toEqual(["Curry", "James"]);
      expect(response.body.data[0].team).toMatchObject({ id: team.id });
    });

    it("filters by teamId", async () => {
      const lakers = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      await createPlayer({ teamId: lakers.id, lastName: "James" });
      await createPlayer({ teamId: celtics.id, lastName: "Tatum" });

      const response = await request(app.getHttpServer()).get(`/v1/players?teamId=${lakers.id}`);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].lastName).toBe("James");
    });

    it("filters by position", async () => {
      await createPlayer({ lastName: "Guard", position: "G" });
      await createPlayer({ lastName: "Center", position: "C" });

      const response = await request(app.getHttpServer()).get("/v1/players?position=C");

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].lastName).toBe("Center");
    });

    it("searches partial player names case-insensitively", async () => {
      await createPlayer({ firstName: "LeBron", lastName: "James" });
      await createPlayer({ firstName: "Stephen", lastName: "Curry" });

      const firstNameResponse = await request(app.getHttpServer()).get("/v1/players?search=EBR");
      const lastNameResponse = await request(app.getHttpServer()).get("/v1/players?search=ame");

      expect(firstNameResponse.body.data.map((player: { lastName: string }) => player.lastName)).toEqual(["James"]);
      expect(lastNameResponse.body.data.map((player: { lastName: string }) => player.lastName)).toEqual(["James"]);
    });

    it("matches full names across first and last name fields", async () => {
      await createPlayer({ firstName: "LeBron", lastName: "James" });
      await createPlayer({ firstName: "LeBron", lastName: "Smith" });

      const response = await request(app.getHttpServer()).get("/v1/players?search=bron%20jam");

      expect(response.body.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({ firstName: "LeBron", lastName: "James" });
    });

    it("combines search with team and position filters", async () => {
      const lakers = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      await createPlayer({ teamId: lakers.id, firstName: "LeBron", lastName: "James", position: "F" });
      await createPlayer({ teamId: lakers.id, firstName: "LeBron", lastName: "Guard", position: "G" });
      await createPlayer({ teamId: celtics.id, firstName: "LeBron", lastName: "Forward", position: "F" });

      const response = await request(app.getHttpServer()).get(
        `/v1/players?search=lebron&teamId=${lakers.id}&position=F`
      );

      expect(response.body.total).toBe(1);
      expect(response.body.data[0].lastName).toBe("James");
    });

    it("paginates the filtered player results and ignores blank search", async () => {
      await createPlayer({ firstName: "Alex", lastName: "Alpha" });
      await createPlayer({ firstName: "Alex", lastName: "Bravo" });
      await createPlayer({ firstName: "Alex", lastName: "Charlie" });

      const filteredResponse = await request(app.getHttpServer()).get("/v1/players?search=alex&page=2&pageSize=2");
      const blankResponse = await request(app.getHttpServer()).get("/v1/players?search=%20%20");

      expect(filteredResponse.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(filteredResponse.body.data).toHaveLength(1);
      expect(blankResponse.body.total).toBe(3);
    });

    it("returns a player with no team as team: null rather than omitting the field", async () => {
      await createPlayer({ teamId: null, lastName: "FreeAgent" });

      const response = await request(app.getHttpServer()).get("/v1/players");

      expect(response.body.data[0].team).toBeNull();
    });

    // Requirement 3 of the postseason plan: a playoffs view shouldn't list
    // an eliminated team's bench alongside players who actually have
    // playoff numbers to show.
    describe("?participated=true", () => {
      async function seedOnePlayoffPlayerAndOneRegularOnlyPlayer() {
        const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
        const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
        const playoffPlayer = await createPlayer({ teamId: home.id, lastName: "James" });
        const regularOnlyPlayer = await createPlayer({ teamId: away.id, lastName: "Zeller" });

        const regularGame = await createGame(home.id, away.id, new Date("2025-10-15"));
        const playoffGame = await createGame(home.id, away.id, new Date("2026-04-20"), "PLAYOFFS", 1);
        await createGameStat(playoffPlayer.id, regularGame.id);
        await createGameStat(regularOnlyPlayer.id, regularGame.id);
        await createGameStat(playoffPlayer.id, playoffGame.id);
      }

      it("narrows the list to players who appeared in that segment", async () => {
        await seedOnePlayoffPlayerAndOneRegularOnlyPlayer();

        const response = await request(app.getHttpServer()).get("/v1/players?seasonType=PLAYOFFS&participated=true");

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(1);
        expect(response.body.data.map((p: { lastName: string }) => p.lastName)).toEqual(["James"]);
      });

      it("lists every player when participated isn't asked for", async () => {
        await seedOnePlayoffPlayerAndOneRegularOnlyPlayer();

        const response = await request(app.getHttpServer()).get("/v1/players?seasonType=PLAYOFFS");

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(2);
      });

      it("excludes a player whose only games are in another segment", async () => {
        await seedOnePlayoffPlayerAndOneRegularOnlyPlayer();

        const response = await request(app.getHttpServer()).get("/v1/players?seasonType=FINALS&participated=true");

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(0);
      });
    });
  });

  // The leaderboard view: once `sort` appears, the ranking runs league-wide
  // before the page slice, so the first page holds the league's best — not
  // merely that page's best.
  describe("GET /v1/players?sort=&minGames=", () => {
    it("ranks by points per game across the whole league before slicing a page", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const lowScorer = await createPlayer({ teamId: home.id, lastName: "Alpha" });
      const topScorer = await createPlayer({ teamId: home.id, lastName: "Bravo" });
      const midScorer = await createPlayer({ teamId: away.id, lastName: "Charlie" });
      await seedGamesForPlayer(lowScorer.id, home.id, away.id, 1, "REGULAR", { points: 10 });
      await seedGamesForPlayer(topScorer.id, home.id, away.id, 1, "REGULAR", { points: 30 });
      await seedGamesForPlayer(midScorer.id, home.id, away.id, 1, "REGULAR", { points: 20 });

      const response = await request(app.getHttpServer()).get("/v1/players?sort=ppg&pageSize=2");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(3);
      expect(response.body.data.map((player: { lastName: string }) => player.lastName)).toEqual([
        "Bravo",
        "Charlie",
      ]);
    });

    it("applies minGames as a participation floor on the ranking", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const oneGameStar = await createPlayer({ teamId: home.id, lastName: "HotNight" });
      const steadyScorer = await createPlayer({ teamId: away.id, lastName: "Steady" });
      await seedGamesForPlayer(oneGameStar.id, home.id, away.id, 1, "REGULAR", { points: 40 });
      await seedGamesForPlayer(steadyScorer.id, home.id, away.id, 2, "REGULAR", { points: 25 });

      const response = await request(app.getHttpServer()).get("/v1/players?sort=ppg&minGames=2");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].lastName).toBe("Steady");
    });

    it("keeps the alphabetical order when only minGames is given — a floor is a filter, not a ranking", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const lateAlphabet = await createPlayer({ teamId: home.id, lastName: "Zeller" });
      const earlyAlphabet = await createPlayer({ teamId: away.id, lastName: "Anderson" });
      await seedGamesForPlayer(lateAlphabet.id, home.id, away.id, 1, "REGULAR", { points: 35 });
      await seedGamesForPlayer(earlyAlphabet.id, home.id, away.id, 1, "REGULAR", { points: 12 });

      const response = await request(app.getHttpServer()).get("/v1/players?minGames=1");

      expect(response.status).toBe(200);
      expect(response.body.data.map((player: { lastName: string }) => player.lastName)).toEqual([
        "Anderson",
        "Zeller",
      ]);
    });

    it("ranks within the requested season segment only", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const regularSeasonStar = await createPlayer({ teamId: home.id, lastName: "RegularStar" });
      const playoffStar = await createPlayer({ teamId: away.id, lastName: "PlayoffStar" });
      await seedGamesForPlayer(regularSeasonStar.id, home.id, away.id, 1, "REGULAR", { points: 35 });
      await seedGamesForPlayer(regularSeasonStar.id, home.id, away.id, 1, "PLAYOFFS", { points: 8 });
      await seedGamesForPlayer(playoffStar.id, home.id, away.id, 1, "REGULAR", { points: 10 });
      await seedGamesForPlayer(playoffStar.id, home.id, away.id, 1, "PLAYOFFS", { points: 42 });

      const response = await request(app.getHttpServer()).get("/v1/players?sort=ppg&seasonType=PLAYOFFS");

      expect(response.status).toBe(200);
      expect(response.body.data.map((player: { lastName: string }) => player.lastName)).toEqual([
        "PlayoffStar",
        "RegularStar",
      ]);
    });

    it("orders a stat ranking ascending on request, sinking players with no games in the segment either way", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const highScorer = await createPlayer({ teamId: home.id, lastName: "Bravo" });
      const lowScorer = await createPlayer({ teamId: home.id, lastName: "Alpha" });
      const didNotPlay = await createPlayer({ teamId: away.id, lastName: "Charlie" });
      await seedGamesForPlayer(highScorer.id, home.id, away.id, 1, "REGULAR", { points: 30 });
      await seedGamesForPlayer(lowScorer.id, home.id, away.id, 1, "REGULAR", { points: 10 });
      await seedGamesForPlayer(didNotPlay.id, home.id, away.id, 1, "PLAYOFFS", { points: 40 });

      const response = await request(app.getHttpServer()).get("/v1/players?sort=ppg&order=asc&seasonType=REGULAR");

      expect(response.status).toBe(200);
      expect(response.body.data.map((player: { lastName: string }) => player.lastName)).toEqual([
        "Alpha",
        "Bravo",
        "Charlie",
      ]);
    });

    it("orders the alphabetical default descending on request", async () => {
      const earlyAlphabet = await createPlayer({ lastName: "Anderson" });
      const lateAlphabet = await createPlayer({ lastName: "Zeller" });

      const response = await request(app.getHttpServer()).get("/v1/players?order=desc");

      expect(response.status).toBe(200);
      expect(response.body.data.map((player: { lastName: string }) => player.lastName)).toEqual([
        "Zeller",
        "Anderson",
      ]);
    });
  });

  // The matchup projection: per-opponent scoring history, plus an
  // opponent-adjusted projected points line for each game still unplayed
  // on the player's team's schedule.
  describe("GET /v1/players/:id/matchup-projection", () => {
    it("splits scoring by opponent and projects each upcoming game with sample-size shrinkage", async () => {
      const lakers = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const knicks = await createTeam({ name: "Knicks", abbreviation: "NYK" });
      const heat = await createTeam({ name: "Heat", abbreviation: "MIA" });
      const player = await createPlayer({ teamId: lakers.id, lastName: "James" });

      // 28.0 PPG overall: 36.0 against Boston (six home, two away),
      // 20.0 against New York.
      await seedGamesForPlayer(player.id, lakers.id, celtics.id, 6, "REGULAR", { points: 36 });
      await seedGamesForPlayer(player.id, celtics.id, lakers.id, 2, "REGULAR", { points: 36 });
      await seedGamesForPlayer(player.id, lakers.id, knicks.id, 8, "REGULAR", { points: 20 });

      // Two still-unplayed games: hosting Boston, then visiting Miami —
      // a team the player has never faced.
      await createGame(lakers.id, celtics.id, new Date(Date.UTC(2099, 0, 1)));
      await createGame(heat.id, lakers.id, new Date(Date.UTC(2099, 0, 3)));

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/matchup-projection`);

      expect(response.status).toBe(200);
      expect(response.body.overallPointsPerGame).toBe(28);

      // Splits rank Boston's 36.0 first, New York's 20.0 second.
      expect(response.body.splits).toEqual([
        { opponent: expect.objectContaining({ abbreviation: "BOS" }), gamesPlayed: 8, pointsPerGame: 36 },
        { opponent: expect.objectContaining({ abbreviation: "NYK" }), gamesPlayed: 8, pointsPerGame: 20 },
      ]);

      // Boston projection: 28 + (36 - 28) * 8/(8+8) = 32.0. Miami has no
      // history, so it projects the overall rate untouched.
      expect(response.body.upcomingGames).toHaveLength(2);
      expect(response.body.upcomingGames[0]).toMatchObject({
        opponent: expect.objectContaining({ abbreviation: "BOS" }),
        isHome: true,
        projectedPoints: 32,
      });
      expect(response.body.upcomingGames[1]).toMatchObject({
        opponent: expect.objectContaining({ abbreviation: "MIA" }),
        isHome: false,
        projectedPoints: 28,
      });
    });

    it("returns an empty upcoming list when the player's team has nothing left to play", async () => {
      const lakers = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const celtics = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const knicks = await createTeam({ name: "Knicks", abbreviation: "NYK" });
      const player = await createPlayer({ teamId: lakers.id });
      await seedGamesForPlayer(player.id, lakers.id, celtics.id, 3, "REGULAR", { points: 30 });

      // A future game that doesn't involve the player's team.
      await createGame(celtics.id, knicks.id, new Date(Date.UTC(2099, 0, 1)));

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/matchup-projection`);

      expect(response.status).toBe(200);
      expect(response.body.splits).toHaveLength(1);
      expect(response.body.upcomingGames).toEqual([]);
    });

    it("returns a 404 with the standard error envelope when the player doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/does-not-exist/matchup-projection");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Player not found" } });
    });
  });

  describe("GET /v1/players/:id", () => {
    it("returns the player when it exists", async () => {
      const player = await createPlayer({ lastName: "Curry" });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: player.id, lastName: "Curry" });
    });

    it("returns a 404 with the standard error envelope when the player doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Player not found" } });
    });
  });

  describe("GET /v1/players/:id/stats", () => {
    it("returns a 404 when the player doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/does-not-exist/stats");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Player not found" } });
    });

    it("derives season averages and a chronological game log from boxscore rows", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer({ teamId: home.id, lastName: "James" });

      const earlierGame = await createGame(home.id, away.id, new Date("2025-10-15"));
      const laterGame = await createGame(home.id, away.id, new Date("2025-10-20"));
      await createGameStat(player.id, earlierGame.id, { points: 20 });
      await createGameStat(player.id, laterGame.id, { points: 30 });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.playerId).toBe(player.id);
      expect(response.body.seasonAverages.gamesPlayed).toBe(2);
      expect(response.body.seasonAverages.pointsPerGame).toBe(25);
      expect(response.body.gameLog.map((entry: { points: number }) => entry.points)).toEqual([20, 30]);
      // Each entry carries its league year so a client can chart one
      // season at a time from a multi-season log.
      expect(response.body.gameLog.map((entry: { season: string }) => entry.season)).toEqual([
        "2025-26",
        "2025-26",
      ]);
    });

    it("returns zeroed averages and an empty game log for a player with no games played", async () => {
      const player = await createPlayer({ lastName: "Rookie" });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.seasonAverages.gamesPlayed).toBe(0);
      expect(response.body.gameLog).toEqual([]);
    });
  });

  // The isolation guarantee the postseason views rest on, tested rather
  // than asserted: a request for one segment must never see another
  // segment's boxscore rows, in either direction. Each segment below is
  // given a distinct points-per-game so any bleed changes the number
  // instead of hiding behind an equal average.
  describe("GET /v1/players/:id/stats?seasonType=", () => {
    async function seedPlayerWithEverySegment() {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer({ teamId: home.id, lastName: "James" });

      const regularGame = await createGame(home.id, away.id, new Date("2025-10-15"));
      const playInGame = await createGame(home.id, away.id, new Date("2026-04-14"), "PLAY_IN");
      const playoffGame = await createGame(home.id, away.id, new Date("2026-04-20"), "PLAYOFFS", 1);
      const finalsGame = await createGame(home.id, away.id, new Date("2026-06-03"), "FINALS", 4);

      await createGameStat(player.id, regularGame.id, { points: 20 });
      await createGameStat(player.id, playInGame.id, { points: 12 });
      await createGameStat(player.id, playoffGame.id, { points: 26 });
      await createGameStat(player.id, finalsGame.id, { points: 31 });

      return player;
    }

    it.each([
      ["REGULAR", 20],
      ["PLAY_IN", 12],
      ["PLAYOFFS", 26],
      ["FINALS", 31],
    ])("returns only %s games and echoes the segment back", async (seasonType, expectedPointsPerGame) => {
      const player = await seedPlayerWithEverySegment();

      const response = await request(app.getHttpServer()).get(
        `/v1/players/${player.id}/stats?seasonType=${seasonType}`
      );

      expect(response.status).toBe(200);
      expect(response.body.seasonType).toBe(seasonType);
      expect(response.body.seasonAverages.gamesPlayed).toBe(1);
      expect(response.body.seasonAverages.pointsPerGame).toBe(expectedPointsPerGame);
      expect(response.body.gameLog).toHaveLength(1);
    });

    it("defaults to the regular season, so existing callers are unaffected by postseason data", async () => {
      const player = await seedPlayerWithEverySegment();

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.seasonType).toBe("REGULAR");
      expect(response.body.seasonAverages.gamesPlayed).toBe(1);
      expect(response.body.seasonAverages.pointsPerGame).toBe(20);
    });

    it("returns an empty segment rather than falling back to another one", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer({ teamId: home.id, lastName: "James" });
      const regularGame = await createGame(home.id, away.id, new Date("2025-10-15"));
      await createGameStat(player.id, regularGame.id, { points: 20 });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats?seasonType=FINALS`);

      expect(response.status).toBe(200);
      expect(response.body.seasonAverages.gamesPlayed).toBe(0);
      expect(response.body.gameLog).toEqual([]);
    });

    it("rejects an unrecognised segment instead of silently serving the default", async () => {
      const player = await createPlayer({ lastName: "James" });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats?seasonType=playoffs`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });
  });

  describe("GET /v1/players/:id/stats/splits", () => {
    it("returns every segment's season line in one response", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer({ teamId: home.id, lastName: "James" });

      const regularGame = await createGame(home.id, away.id, new Date("2025-10-15"));
      const playoffGame = await createGame(home.id, away.id, new Date("2026-04-20"), "PLAYOFFS", 1);
      await createGameStat(player.id, regularGame.id, { points: 20 });
      await createGameStat(player.id, playoffGame.id, { points: 26 });

      const response = await request(app.getHttpServer()).get(`/v1/players/${player.id}/stats/splits`);

      expect(response.status).toBe(200);
      expect(response.body.playerId).toBe(player.id);
      expect(response.body.splits.REGULAR.pointsPerGame).toBe(20);
      expect(response.body.splits.PLAYOFFS.pointsPerGame).toBe(26);
      // Segments the player didn't appear in are present and zeroed, not
      // omitted — the comparison view renders a fixed set of columns.
      expect(response.body.splits.PLAY_IN.gamesPlayed).toBe(0);
      expect(response.body.splits.FINALS.gamesPlayed).toBe(0);
    });

    it("returns a 404 when the player doesn't exist", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/does-not-exist/stats/splits");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Player not found" } });
    });
  });

  describe("GET /v1/players/compare", () => {
    it("returns each requested player with their team and derived season averages", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const first = await createPlayer({ teamId: home.id, lastName: "James" });
      const second = await createPlayer({ teamId: away.id, lastName: "Tatum" });
      const game = await createGame(home.id, away.id, new Date("2025-10-15"));
      await createGameStat(first.id, game.id, { points: 30 });
      await createGameStat(second.id, game.id, { points: 20 });

      const response = await request(app.getHttpServer()).get(
        `/v1/players/compare?ids=${first.id},${second.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.players.map((entry: { player: { lastName: string } }) => entry.player.lastName)).toEqual([
        "James",
        "Tatum",
      ]);
      expect(response.body.players[0].player.team).toMatchObject({ id: home.id });
      expect(response.body.players[0].seasonAverages.pointsPerGame).toBe(30);
    });

    it("de-duplicates repeated ids while preserving order", async () => {
      const first = await createPlayer({ lastName: "James" });
      const second = await createPlayer({ lastName: "Tatum" });

      const response = await request(app.getHttpServer()).get(
        `/v1/players/compare?ids=${first.id},${second.id},${first.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.players).toHaveLength(2);
    });

    it("returns a 400 when fewer than two distinct players are requested", async () => {
      const player = await createPlayer({ lastName: "Solo" });

      const response = await request(app.getHttpServer()).get(`/v1/players/compare?ids=${player.id}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns a 400 when more than four players are requested", async () => {
      const players = await Promise.all(
        Array.from({ length: 5 }, (_, index) => createPlayer({ lastName: `P${index}` }))
      );

      const response = await request(app.getHttpServer()).get(
        `/v1/players/compare?ids=${players.map((player) => player.id).join(",")}`
      );

      expect(response.status).toBe(400);
    });

    it("returns a 404 when a requested player does not exist", async () => {
      const player = await createPlayer({ lastName: "Real" });

      const response = await request(app.getHttpServer()).get(
        `/v1/players/compare?ids=${player.id},does-not-exist`
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  // The "League leaders" band: one leader per headline category, after a
  // participation floor keeps a small-sample hot streak from leading.
  describe("GET /v1/players/leaders", () => {
    async function seedOneCategoryLeaderEach() {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const scorer = await createPlayer({ teamId: home.id, lastName: "Scorer" });
      const rebounder = await createPlayer({ teamId: home.id, lastName: "Rebounder" });
      const playmaker = await createPlayer({ teamId: away.id, lastName: "Playmaker" });
      const efficient = await createPlayer({ teamId: away.id, lastName: "Efficient" });

      await seedGamesForPlayer(scorer.id, home.id, away.id, 1, "REGULAR", { points: 30 });
      await seedGamesForPlayer(rebounder.id, home.id, away.id, 1, "REGULAR", { points: 15, rebounds: 12 });
      await seedGamesForPlayer(playmaker.id, home.id, away.id, 1, "REGULAR", { points: 18, assists: 11 });
      await seedGamesForPlayer(efficient.id, home.id, away.id, 1, "REGULAR", {
        points: 28,
        fieldGoalsAttempted: 10,
        freeThrowsAttempted: 12,
      });

      return { scorer, rebounder, playmaker, efficient };
    }

    it("returns the leader of each headline category with the figure and games played", async () => {
      const { scorer, rebounder, playmaker, efficient } = await seedOneCategoryLeaderEach();

      const response = await request(app.getHttpServer()).get("/v1/players/leaders?minGames=1");

      expect(response.status).toBe(200);
      expect(response.body.seasonType).toBe("REGULAR");
      expect(response.body.minGames).toBe(1);
      expect(response.body.leaders.ppg).toMatchObject({
        player: { id: scorer.id },
        value: 30,
        gamesPlayed: 1,
      });
      expect(response.body.leaders.rpg.player.id).toBe(rebounder.id);
      expect(response.body.leaders.apg.player.id).toBe(playmaker.id);
      expect(response.body.leaders.tsPct.player.id).toBe(efficient.id);
      expect(response.body.leaders.tsPct.value).toBeCloseTo(91.6, 1);
    });

    it("applies the default 15-game floor in the regular season", async () => {
      // 14 games at a huge average still can't lead: the floor is about
      // sample size, not the size of the number.
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const shortSampleStar = await createPlayer({ teamId: home.id, lastName: "HotStart" });
      const qualified = await createPlayer({ teamId: away.id, lastName: "Steady" });
      await seedGamesForPlayer(shortSampleStar.id, home.id, away.id, 14, "REGULAR", { points: 50 });
      await seedGamesForPlayer(qualified.id, home.id, away.id, 15, "REGULAR", { points: 20 });

      const response = await request(app.getHttpServer()).get("/v1/players/leaders");

      expect(response.status).toBe(200);
      expect(response.body.minGames).toBe(15);
      expect(response.body.leaders.ppg).toMatchObject({
        player: { id: qualified.id },
        value: 20,
        gamesPlayed: 15,
      });
    });

    it("drops the floor to a postseason-sized sample for playoff segments", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const threeGameStar = await createPlayer({ teamId: home.id, lastName: "Brief" });
      const fourGameStar = await createPlayer({ teamId: away.id, lastName: "Lasted" });
      await seedGamesForPlayer(threeGameStar.id, home.id, away.id, 3, "PLAYOFFS", { points: 45 });
      await seedGamesForPlayer(fourGameStar.id, home.id, away.id, 4, "PLAYOFFS", { points: 28 });

      const response = await request(app.getHttpServer()).get("/v1/players/leaders?seasonType=PLAYOFFS");

      expect(response.status).toBe(200);
      expect(response.body.seasonType).toBe("PLAYOFFS");
      expect(response.body.minGames).toBe(4);
      expect(response.body.leaders.ppg.player.id).toBe(fourGameStar.id);
    });

    it("honours an explicit minGames floor over the segment default", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const threeGameStar = await createPlayer({ teamId: home.id, lastName: "HotStart" });
      const fiveGameScorer = await createPlayer({ teamId: away.id, lastName: "Steady" });
      await seedGamesForPlayer(threeGameStar.id, home.id, away.id, 3, "REGULAR", { points: 40 });
      await seedGamesForPlayer(fiveGameScorer.id, home.id, away.id, 5, "REGULAR", { points: 22 });

      const response = await request(app.getHttpServer()).get("/v1/players/leaders?minGames=3");

      expect(response.status).toBe(200);
      expect(response.body.minGames).toBe(3);
      expect(response.body.leaders.ppg.player.id).toBe(threeGameStar.id);
    });

    it("returns null for a category nobody qualified for", async () => {
      await createPlayer({ lastName: "NoGames" });

      const response = await request(app.getHttpServer()).get("/v1/players/leaders");

      expect(response.status).toBe(200);
      expect(response.body.leaders).toEqual({ ppg: null, rpg: null, apg: null, tsPct: null });
    });
  });

  describe("GET /v1/players/stats-batch", () => {
    it("returns season averages and game log for every requested player in one request", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const first = await createPlayer({ teamId: home.id, lastName: "James" });
      const second = await createPlayer({ teamId: away.id, lastName: "Tatum" });
      const game = await createGame(home.id, away.id, new Date("2025-10-15"));
      await createGameStat(first.id, game.id, { points: 30 });
      await createGameStat(second.id, game.id, { points: 20 });

      const response = await request(app.getHttpServer()).get(
        `/v1/players/stats-batch?ids=${first.id},${second.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.players).toEqual([
        expect.objectContaining({ playerId: first.id, seasonAverages: expect.objectContaining({ pointsPerGame: 30 }) }),
        expect.objectContaining({ playerId: second.id, seasonAverages: expect.objectContaining({ pointsPerGame: 20 }) }),
      ]);
      expect(response.body.players[0].gameLog).toHaveLength(1);
    });

    it("returns a zeroed entry rather than a 404 for a player id with no ingested stats", async () => {
      const player = await createPlayer({ lastName: "NoGamesYet" });

      const response = await request(app.getHttpServer()).get(`/v1/players/stats-batch?ids=${player.id}`);

      expect(response.status).toBe(200);
      expect(response.body.players).toEqual([
        expect.objectContaining({ playerId: player.id, seasonAverages: expect.objectContaining({ gamesPlayed: 0 }), gameLog: [] }),
      ]);
    });

    it("de-duplicates repeated ids", async () => {
      const player = await createPlayer({ lastName: "Solo" });

      const response = await request(app.getHttpServer()).get(
        `/v1/players/stats-batch?ids=${player.id},${player.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.players).toHaveLength(1);
    });

    it("narrows every entry to the requested segment when seasonType is given", async () => {
      const home = await createTeam({ name: "Lakers", abbreviation: "LAL" });
      const away = await createTeam({ name: "Celtics", abbreviation: "BOS" });
      const player = await createPlayer({ teamId: home.id, lastName: "James" });
      const regularGame = await createGame(home.id, away.id, new Date("2025-10-15"));
      const playoffGame = await createGame(home.id, away.id, new Date("2026-04-20"), "PLAYOFFS", 1);
      await createGameStat(player.id, regularGame.id, { points: 20 });
      await createGameStat(player.id, playoffGame.id, { points: 36 });

      const response = await request(app.getHttpServer()).get(
        `/v1/players/stats-batch?ids=${player.id}&seasonType=PLAYOFFS`
      );

      expect(response.status).toBe(200);
      expect(response.body.players).toEqual([
        expect.objectContaining({
          playerId: player.id,
          seasonAverages: expect.objectContaining({ gamesPlayed: 1, pointsPerGame: 36 }),
        }),
      ]);
    });

    it("returns a 400 when no ids are given", async () => {
      const response = await request(app.getHttpServer()).get("/v1/players/stats-batch");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });
  });
});
