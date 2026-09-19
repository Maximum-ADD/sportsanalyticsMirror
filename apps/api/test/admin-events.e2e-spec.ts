import type { INestApplication } from "@nestjs/common";
import type { Game, Player, PlayerGameStat, Team } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./create-test-app.js";
import { resetDatabase, testPrisma } from "./test-db.js";
import { auth } from "../src/auth/auth.config.js";

vi.mock("../src/auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const ADMIN_USER_ID = "admin-events-1";

let nextId = 0;
function uid() {
  nextId += 1;
  return nextId;
}

async function createTeam(name: string, abbreviation: string): Promise<Team> {
  return testPrisma.team.create({
    data: {
      nbaTeamId: uid(),
      name,
      abbreviation,
      city: "City",
      conference: "West",
      division: "Pacific",
    },
  });
}

async function createPlayer(firstName: string, lastName: string, teamId: string): Promise<Player> {
  return testPrisma.player.create({
    data: { nbaPlayerId: uid(), firstName, lastName, position: "G", teamId },
  });
}

async function createGame(homeTeamId: string, awayTeamId: string): Promise<Game> {
  return testPrisma.game.create({
    data: {
      nbaGameId: `AE-${uid()}`,
      gameDate: new Date("2025-11-01"),
      season: "2025-26",
      homeTeamId,
      awayTeamId,
    },
  });
}

type CountingStatOverrides = Partial<
  Pick<
    PlayerGameStat,
    | "points"
    | "rebounds"
    | "assists"
    | "steals"
    | "blocks"
    | "turnovers"
    | "fieldGoalsMade"
    | "fieldGoalsAttempted"
    | "threesMade"
    | "threesAttempted"
    | "freeThrowsMade"
    | "freeThrowsAttempted"
  >
>;

async function createStatRow(playerId: string, gameId: string, teamId: string | null, stats: CountingStatOverrides = {}) {
  return testPrisma.playerGameStat.create({
    data: {
      playerId,
      gameId,
      teamId,
      minutes: 30,
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threesMade: 0,
      threesAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      ...stats,
    },
  });
}

describe("Admin event corrections and replay", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await testPrisma.user.create({
      data: { id: ADMIN_USER_ID, name: "Admin", email: "admin-events@example.com", role: "ADMIN" },
    });
  });

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: ADMIN_USER_ID, role: "ADMIN" },
    } as never);
  });

  afterEach(async () => {
    await testPrisma.eventCorrection.deleteMany();
    await testPrisma.datasetRelease.deleteMany();
    await testPrisma.playerGameStat.deleteMany();
    await testPrisma.gameEvent.deleteMany();
    await testPrisma.game.deleteMany();
    await testPrisma.player.deleteMany();
    await testPrisma.team.deleteMany();
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { id: ADMIN_USER_ID } });
    await resetDatabase();
    await app.close();
  });

  // A small real-shaped game: Warriors (home) v Lakers (away). Curry makes
  // an assisted three, Green fouls, James misses a layup, Thompson rebounds
  // it, James turns it over. Every player needs an event of their own to be
  // resolvable as a credited player (see buildGameRoster). Stat rows start
  // at zero, as if the box-score-only path wrote them before any derivation
  // ran, unless a test seeds them otherwise.
  async function seedGame(statsByPlayer: Record<string, CountingStatOverrides> = {}) {
    const home = await createTeam("Warriors", "GSW");
    const away = await createTeam("Lakers", "LAL");
    const curry = await createPlayer("Stephen", "Curry", home.id);
    const green = await createPlayer("Draymond", "Green", home.id);
    const thompson = await createPlayer("Klay", "Thompson", home.id);
    const james = await createPlayer("LeBron", "James", away.id);
    const game = await createGame(home.id, away.id);

    const base = { gameId: game.id, period: 1, subType: null, success: null, value: 0 };
    await testPrisma.gameEvent.createMany({
      data: [
        { ...base, sequence: 1, clock: "PT11M30.00S", eventType: "3pt", subType: "Jump Shot", playerId: curry.id, teamId: home.id, success: true, value: 3, description: "Curry 26' 3PT Jump Shot (3 PTS) (Green 1 AST)" },
        { ...base, sequence: 2, clock: "PT11M00.00S", eventType: "foul", subType: "Personal", playerId: green.id, teamId: home.id, description: "Green P.FOUL (P1.T1)" },
        { ...base, sequence: 3, clock: "PT10M40.00S", eventType: "2pt", subType: "Driving Layup Shot", playerId: james.id, teamId: away.id, success: false, value: 2, description: "MISS James 5' Driving Layup" },
        { ...base, sequence: 4, clock: "PT10M38.00S", eventType: "rebound", subType: "defensive", playerId: thompson.id, teamId: home.id, description: "Thompson REBOUND (Off:0 Def:1)" },
        { ...base, sequence: 5, clock: "PT10M20.00S", eventType: "turnover", subType: "Bad Pass", playerId: james.id, teamId: away.id, description: "James Bad Pass Turnover (P1.T1)" },
      ],
    });

    for (const [player, teamId] of [[curry, home.id], [green, home.id], [thompson, home.id], [james, away.id]] as const) {
      await createStatRow(player.id, game.id, teamId, statsByPlayer[player.lastName]);
    }
    return { game, home, away, curry, green, thompson, james };
  }

  function correct(gameId: string, sequence: number, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/v1/admin/games/${gameId}/events/${sequence}/correct`).send(body);
  }

  function statOf(playerId: string, gameId: string) {
    return testPrisma.playerGameStat.findUniqueOrThrow({ where: { playerId_gameId: { playerId, gameId } } });
  }

  function eventAt(gameId: string, sequence: number) {
    return testPrisma.gameEvent.findUniqueOrThrow({ where: { gameId_sequence: { gameId, sequence } } });
  }

  describe("POST /v1/admin/games/:gameId/events/:sequence/correct", () => {
    it("re-derives PlayerGameStat for the game from the corrected events", async () => {
      const { game, curry, green } = await seedGame();

      // Correct the shot's clock — a field that doesn't change the
      // aggregation outcome, so this test only proves recompute runs (the
      // rows start at all zeros and don't match the events until it does).
      const response = await correct(game.id, 1, { clock: "PT11M25.00S", reason: "clock sync fix" });

      expect(response.status).toBe(201);
      const curryStat = await statOf(curry.id, game.id);
      expect(curryStat.points).toBe(3);
      expect(curryStat.threesMade).toBe(1);
      expect(curryStat.threesAttempted).toBe(1);
      expect((await statOf(green.id, game.id)).assists).toBe(1);
    });

    it("records who changed what, from what, to what, and why", async () => {
      const { game } = await seedGame();

      const response = await correct(game.id, 1, { clock: "PT11M25.00S", reason: "clock sync fix" });

      expect(response.body.correction).toMatchObject({
        gameId: game.id,
        sequence: 1,
        previousValues: { clock: "PT11M30.00S" },
        newValues: { clock: "PT11M25.00S" },
        correctedById: ADMIN_USER_ID,
        reason: "clock sync fix",
      });
      expect(response.body.changes).toEqual([{ field: "clock", from: "PT11M30.00S", to: "PT11M25.00S" }]);
    });

    // Stats are seeded as ingestion leaves them (already matching the
    // events), so the play's previous player really starts with its
    // points. With zeroed seeds this passed even while the previous player
    // was never recomputed and kept the points the new player also got.
    it("moves derived stats to the corrected player when playerId is reassigned", async () => {
      const { game, curry, thompson } = await seedGame({
        Curry: { points: 3, fieldGoalsMade: 1, fieldGoalsAttempted: 1, threesMade: 1, threesAttempted: 1 },
        Thompson: { rebounds: 1 },
      });

      const response = await correct(game.id, 1, {
        playerId: thompson.id,
        description: "Thompson 26' 3PT Jump Shot (3 PTS) (Green 1 AST)",
        reason: "wrong shooter",
      });

      const curryStat = await statOf(curry.id, game.id);
      expect({ points: curryStat.points, fieldGoalsAttempted: curryStat.fieldGoalsAttempted, threesMade: curryStat.threesMade }).toEqual({
        points: 0,
        fieldGoalsAttempted: 0,
        threesMade: 0,
      });
      expect((await statOf(thompson.id, game.id)).points).toBe(3);
      expect(response.body.statChanges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ playerName: "Stephen Curry", stats: expect.arrayContaining([{ field: "points", before: 3, after: 0 }]) }),
          expect.objectContaining({ playerName: "Klay Thompson", stats: expect.arrayContaining([{ field: "points", before: 0, after: 3 }]) }),
        ]),
      );
    });

    // Moving a player's only play leaves them with no events, and a player
    // with no events is normally not a valid credit target. They are kept
    // as one for this correction, so it doesn't also strip the assist they
    // made on someone else's shot.
    it("keeps credits a player earned elsewhere when their only play is moved away", async () => {
      const { game, home, curry, green, thompson } = await seedGame();
      await testPrisma.gameEvent.create({
        data: {
          gameId: game.id, sequence: 6, period: 1, clock: "PT10M00.00S", eventType: "2pt", subType: "Layup Shot",
          playerId: green.id, teamId: home.id, success: true, value: 2, description: "Green 2' Layup (2 PTS) (Thompson 1 AST)",
        },
      });
      await testPrisma.playerGameStat.update({
        where: { playerId_gameId: { playerId: thompson.id, gameId: game.id } },
        data: { rebounds: 1, assists: 1 },
      });

      await correct(game.id, 4, { playerId: curry.id, reason: "Curry got the board" });

      const thompsonStat = await statOf(thompson.id, game.id);
      expect({ rebounds: thompsonStat.rebounds, assists: thompsonStat.assists }).toEqual({ rebounds: 0, assists: 1 });
      expect((await statOf(curry.id, game.id)).rebounds).toBe(1);

      // A later replay leaves them alone too: they act in no event.
      await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);
      expect((await statOf(thompson.id, game.id)).assists).toBe(1);
    });

    it("marks the season's dataset releases stale and reports how many", async () => {
      const { game } = await seedGame();
      await testPrisma.datasetRelease.create({
        data: {
          version: "2025-26.1",
          description: "first",
          season: "2025-26",
          checksum: "x",
          gamesCount: 1,
          playersCount: 1,
          eventsCount: 1,
          fieldSchema: {},
        },
      });

      const response = await correct(game.id, 1, { clock: "PT11M25.00S", reason: "clock sync fix" });

      expect(response.body.releasesMarkedStale).toBe(1);
      expect((await testPrisma.datasetRelease.findFirstOrThrow()).isStale).toBe(true);
    });

    it("returns 404 for an event that doesn't exist", async () => {
      const { game } = await seedGame();
      const response = await correct(game.id, 999, { clock: "PT00M00.00S", reason: "typo" });
      expect(response.status).toBe(404);
    });

    describe("reason", () => {
      it.each([
        ["missing", {}],
        ["blank", { reason: "   " }],
        ["not a string", { reason: 7 }],
      ])("rejects a %s reason with 400 and writes nothing", async (_label, reasonField) => {
        const { game } = await seedGame();

        const response = await correct(game.id, 1, { clock: "PT11M25.00S", ...reasonField });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/reason is required/);
        expect((await eventAt(game.id, 1)).clock).toBe("PT11M30.00S");
        expect(await testPrisma.eventCorrection.count()).toBe(0);
      });
    });

    describe("validation of the corrected play", () => {
      // Each case would once have been a 500 or silently corrupted stats.
      it.each([
        ["a non-integer period", () => ({ period: "2" }), /period must be an integer/],
        ["a fractional period", () => ({ period: 1.5 }), /period must be an integer/],
        ["a period past 10", () => ({ period: 11 }), /period must be an integer from 1 to 10/],
        ["a malformed clock", () => ({ clock: "PT99M00.00S" }), /not a valid game clock/],
        ["an unknown event type", () => ({ eventType: "slam" }), /not in the platform vocabulary/],
        ["a value that isn't the shot's", () => ({ value: 5 }), /value 5 doesn't fit a made 3pt/],
        ["success on a non-shot", () => ({ eventType: "rebound", subType: "defensive", value: 0 }), /success only applies/],
        ["a shot with no made/missed", () => ({ success: null }), /must be marked made or missed/],
        ["an unknown team", () => ({ teamId: "00000000-0000-0000-0000-000000000000" }), /neither team in this game/],
        ["an unknown player", () => ({ playerId: "00000000-0000-0000-0000-000000000000" }), /did not play in this game/],
        ["an empty description", () => ({ description: "  " }), /description must not be empty/],
        ["no change at all", () => ({ clock: "PT11M30.00S" }), /Nothing to change/],
      ])("rejects %s with 400 and leaves stats alone", async (_label, makePatch, message) => {
        const { game, curry } = await seedGame({ Curry: { points: 3 } });

        const response = await correct(game.id, 1, { ...makePatch(), reason: "test" });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(message);
        expect((await eventAt(game.id, 1)).eventType).toBe("3pt");
        expect((await statOf(curry.id, game.id)).points).toBe(3);
        expect(await testPrisma.eventCorrection.count()).toBe(0);
      });

      it("rejects a team that isn't the player's own", async () => {
        const { game, away } = await seedGame();
        const response = await correct(game.id, 1, { teamId: away.id, reason: "test" });
        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/does not match the team the player played for/);
      });

      it("rejects a player who is in the database but not in this game", async () => {
        const { game, home } = await seedGame();
        const outsider = await createPlayer("Other", "Guard", home.id);
        const response = await correct(game.id, 1, { playerId: outsider.id, reason: "test" });
        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/did not play in this game/);
      });

      it("accepts a play corrected to another valid shape in one go", async () => {
        const { game, curry } = await seedGame();

        const response = await correct(game.id, 1, { eventType: "2pt", value: 2, reason: "was a long two" });

        expect(response.status).toBe(201);
        expect((await statOf(curry.id, game.id)).points).toBe(2);
      });
    });

    describe("credits", () => {
      it("moves an assist to another teammate by rewriting the description's suffix", async () => {
        const { game, green, thompson } = await seedGame();

        const response = await correct(game.id, 1, { creditPlayerId: thompson.id, reason: "wrong passer" });

        expect(response.status).toBe(201);
        expect((await eventAt(game.id, 1)).description).toBe("Curry 26' 3PT Jump Shot (3 PTS) (Thompson 1 AST)");
        expect((await statOf(thompson.id, game.id)).assists).toBe(1);
        expect((await statOf(green.id, game.id)).assists).toBe(0);
        expect(response.body.correction.newValues).toEqual({
          description: "Curry 26' 3PT Jump Shot (3 PTS) (Thompson 1 AST)",
        });
      });

      it("removes an assist when the credit is set to none", async () => {
        const { game, green } = await seedGame({ Green: { assists: 1 } });

        await correct(game.id, 1, { creditPlayerId: null, reason: "unassisted" });

        expect((await eventAt(game.id, 1)).description).toBe("Curry 26' 3PT Jump Shot (3 PTS)");
        expect((await statOf(green.id, game.id)).assists).toBe(0);
      });

      it("credits a block and a steal to the other team", async () => {
        const { game, green, thompson } = await seedGame();

        await correct(game.id, 3, { creditPlayerId: green.id, reason: "missed block" });
        await correct(game.id, 5, { creditPlayerId: thompson.id, reason: "missed steal" });

        expect((await eventAt(game.id, 3)).description).toBe("MISS James 5' Driving Layup (Green 1 BLK)");
        expect((await statOf(green.id, game.id)).blocks).toBe(1);
        expect((await eventAt(game.id, 5)).description).toBe("James Bad Pass Turnover (P1.T1) (Thompson 1 STL)");
        expect((await statOf(thompson.id, game.id)).steals).toBe(1);
      });

      it("swaps an assist for a block when a made shot is corrected to missed", async () => {
        const { game, curry, green, james } = await seedGame();

        const response = await correct(game.id, 1, { success: false, creditPlayerId: james.id, reason: "rimmed out" });

        expect(response.status).toBe(201);
        expect((await eventAt(game.id, 1)).description).toBe("Curry 26' 3PT Jump Shot (3 PTS) (James 1 BLK)");
        expect((await statOf(curry.id, game.id)).points).toBe(0);
        expect((await statOf(green.id, game.id)).assists).toBe(0);
        expect((await statOf(james.id, game.id)).blocks).toBe(1);
      });

      it.each([
        ["an assist from the other team", 1, "james", /must come from the shooter's team/],
        ["a block by the shooter themself", 3, "james", /own play/],
        ["a steal by the player who lost the ball", 5, "james", /own play/],
        ["a credit on a play that takes none", 4, "green", /takes no credit/],
      ] as const)("rejects %s with 400", async (_label, sequence, creditedKey, message) => {
        const seeded = await seedGame();

        const response = await correct(seeded.game.id, sequence, { creditPlayerId: seeded[creditedKey].id, reason: "test" });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(message);
      });

      it("rejects a block from the shooter's own team", async () => {
        const { game, away } = await seedGame();
        const davis = await createPlayer("Anthony", "Davis", away.id);
        await testPrisma.gameEvent.create({
          data: { gameId: game.id, sequence: 6, period: 1, clock: "PT10M00.00S", eventType: "foul", playerId: davis.id, teamId: away.id, value: 0, description: "Davis P.FOUL" },
        });
        await createStatRow(davis.id, game.id, away.id);

        const response = await correct(game.id, 3, { creditPlayerId: davis.id, reason: "test" });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/must come from the other team/);
      });
    });
  });

  describe("POST /v1/admin/games/:gameId/replay", () => {
    it("recomputes stats without requiring any event correction", async () => {
      const { game, curry } = await seedGame();

      const response = await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ gameId: game.id, playersRecomputed: 4, playersChanged: 4 });
      expect((await statOf(curry.id, game.id)).points).toBe(3);
    });

    it("returns 404 for a game that doesn't exist", async () => {
      const response = await request(app.getHttpServer()).post("/v1/admin/games/does-not-exist/replay");
      expect(response.status).toBe(404);
    });

    // Every game ingested before play-by-play was translated holds only
    // period markers. Replaying one used to write 0 over every player's
    // points, rebounds and assists, because nobody could be derived.
    it("leaves a game's stats alone when its events don't involve any player", async () => {
      const team = await createTeam("Warriors", "GSW");
      const player = await createPlayer("Stephen", "Curry", team.id);
      const game = await createGame(team.id, team.id);
      await testPrisma.gameEvent.createMany({
        data: [
          { gameId: game.id, sequence: 1, period: 1, clock: "12:00", eventType: "period", subType: "start", description: "Start of 1st Period" },
          { gameId: game.id, sequence: 2, period: 1, clock: "0:00", eventType: "period", subType: "end", description: "End of 1st Period" },
        ],
      });
      await createStatRow(player.id, game.id, team.id, {
        points: 31, rebounds: 6, assists: 9, steals: 2, turnovers: 3, fieldGoalsMade: 11, fieldGoalsAttempted: 20,
        threesMade: 5, threesAttempted: 11, freeThrowsMade: 4, freeThrowsAttempted: 4,
      });

      const response = await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);

      expect(response.body).toEqual({ gameId: game.id, playersRecomputed: 0, playersChanged: 0 });
      const stat = await statOf(player.id, game.id);
      expect({ points: stat.points, rebounds: stat.rebounds, assists: stat.assists }).toEqual({ points: 31, rebounds: 6, assists: 9 });
    });

    it("recomputes players who act in the events and leaves the rest alone", async () => {
      const { game, home, curry, green } = await seedGame();
      const benchPlayer = await createPlayer("Bench", "Warmer", home.id);
      // In the boxscore, but never the actor of an event in this game.
      await createStatRow(benchPlayer.id, game.id, home.id, { assists: 1 });

      await request(app.getHttpServer()).post(`/v1/admin/games/${game.id}/replay`);

      expect((await statOf(curry.id, game.id)).points).toBe(3);
      expect((await statOf(green.id, game.id)).assists).toBe(1);
      expect((await statOf(benchPlayer.id, game.id)).assists).toBe(1);
    });
  });
});
