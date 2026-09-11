import type { Game, GamePrediction, Player, Team } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamsService } from "./teams.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { PlayersService } from "../players/players.service.js";
import type { StatsService } from "../players/stats.service.js";

const LAKERS: Team = { id: "team-lal" } as Team;
const CELTICS: Team = { id: "team-bos" } as Team;

function makePrediction(overrides: Partial<GamePrediction> = {}): GamePrediction {
  return {
    id: "prediction-1",
    gameId: "game-1",
    homeWinProbability: 0.6,
    homeTeamEloPre: 1500,
    awayTeamEloPre: 1500,
    predictedMarginHome: 2,
    marginMethod: "regression",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game & { homeTeam: Team; awayTeam: Team; prediction: GamePrediction }>) {
  return {
    id: "game-1",
    nbaGameId: "MOCK-1",
    gameDate: new Date("2026-01-01"),
    season: "2025-26",
    homeTeamId: LAKERS.id,
    awayTeamId: CELTICS.id,
    homeTeam: LAKERS,
    awayTeam: CELTICS,
    homeScore: 100,
    awayScore: 98,
    prediction: makePrediction(),
    ...overrides,
  };
}

describe("TeamsService.getEloRatings", () => {
  let prisma: { game: { findMany: ReturnType<typeof vi.fn> } };
  let teamsService: TeamsService;

  beforeEach(() => {
    prisma = { game: { findMany: vi.fn() } };
    teamsService = new TeamsService(
      prisma as unknown as PrismaService,
      {} as unknown as PlayersService,
      {} as unknown as StatsService
    );
  });

  it("reads a team's rating from its most recent game, whichever side (home/away) that was", async () => {
    // Lakers' most recent game (by date) was played AWAY — the rating must
    // come from awayTeamEloPre on that game, not a stale homeTeamEloPre
    // from an earlier game where they were the home team.
    const olderAsHome = makeGame({
      id: "older",
      gameDate: new Date("2026-01-01"),
      homeTeamId: LAKERS.id,
      homeTeam: LAKERS,
      prediction: makePrediction({ homeTeamEloPre: 1490 }),
    });
    const newerAsAway = makeGame({
      id: "newer",
      gameDate: new Date("2026-03-01"),
      awayTeamId: LAKERS.id,
      awayTeam: LAKERS,
      prediction: makePrediction({ awayTeamEloPre: 1550 }),
    });

    prisma.game.findMany.mockImplementation(({ distinct }: { distinct: string[] }) => {
      if (distinct[0] === "homeTeamId") return Promise.resolve([olderAsHome]);
      return Promise.resolve([newerAsAway]);
    });

    const ratings = await teamsService.getEloRatings();
    const lakers = ratings.find((rating) => rating.team.id === LAKERS.id);

    expect(lakers?.elo).toBe(1550);
    expect(lakers?.asOfGameId).toBe("newer");
  });

  it("sorts by rating, highest first", async () => {
    const strong = makeGame({
      id: "g1",
      homeTeamId: LAKERS.id,
      homeTeam: LAKERS,
      awayTeamId: CELTICS.id,
      awayTeam: CELTICS,
      prediction: makePrediction({ homeTeamEloPre: 1600, awayTeamEloPre: 1400 }),
    });

    prisma.game.findMany.mockImplementation(({ distinct }: { distinct: string[] }) => {
      if (distinct[0] === "homeTeamId") return Promise.resolve([strong]);
      return Promise.resolve([strong]);
    });

    const ratings = await teamsService.getEloRatings();

    expect(ratings.map((rating) => rating.team.id)).toEqual([LAKERS.id, CELTICS.id]);
    expect(ratings[0].elo).toBeGreaterThan(ratings[1].elo);
  });
});

function makePlayer(overrides: Partial<Player> = {}): Player & { team: Team | null } {
  return {
    id: "player-1",
    nbaPlayerId: 1,
    firstName: "First",
    lastName: "Last",
    position: "G",
    heightInches: null,
    weightLbs: null,
    jerseyNumber: null,
    headshotUrl: null,
    teamId: LAKERS.id,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
    team: LAKERS,
    ...overrides,
  };
}

describe("TeamsService.getSuggestedPlayers", () => {
  let playersService: { getTeamRoster: ReturnType<typeof vi.fn> };
  let statsService: { getPlayerStatsBatch: ReturnType<typeof vi.fn> };
  let teamsService: TeamsService;

  beforeEach(() => {
    playersService = { getTeamRoster: vi.fn() };
    statsService = { getPlayerStatsBatch: vi.fn() };
    teamsService = new TeamsService(
      {} as unknown as PrismaService,
      playersService as unknown as PlayersService,
      statsService as unknown as StatsService
    );
  });

  it("ranks roster players by usage percentage, highest first", async () => {
    const highUsage = makePlayer({ id: "high", firstName: "High" });
    const lowUsage = makePlayer({ id: "low", firstName: "Low" });
    playersService.getTeamRoster.mockResolvedValue([lowUsage, highUsage]);
    statsService.getPlayerStatsBatch.mockResolvedValue([
      { playerId: "low", seasonAverages: { usagePercentage: 12.5 }, gameLog: [] },
      { playerId: "high", seasonAverages: { usagePercentage: 31.2 }, gameLog: [] },
    ]);

    const result = await teamsService.getSuggestedPlayers(LAKERS.id);

    expect(result.map((entry) => entry.player.id)).toEqual(["high", "low"]);
    expect(result[0].usagePercentage).toBe(31.2);
  });

  it("sorts players with no usage data after every player with a real rate, rather than dropping them", async () => {
    const noStats = makePlayer({ id: "no-stats", firstName: "Rookie" });
    const hasStats = makePlayer({ id: "has-stats", firstName: "Veteran" });
    playersService.getTeamRoster.mockResolvedValue([noStats, hasStats]);
    statsService.getPlayerStatsBatch.mockResolvedValue([
      { playerId: "no-stats", seasonAverages: { usagePercentage: null }, gameLog: [] },
      { playerId: "has-stats", seasonAverages: { usagePercentage: 22.0 }, gameLog: [] },
    ]);

    const result = await teamsService.getSuggestedPlayers(LAKERS.id);

    expect(result.map((entry) => entry.player.id)).toEqual(["has-stats", "no-stats"]);
    expect(result).toHaveLength(2);
  });

  it("caps the result at the requested count", async () => {
    const roster = Array.from({ length: 12 }, (_, index) => makePlayer({ id: `p${index}`, firstName: `P${index}` }));
    playersService.getTeamRoster.mockResolvedValue(roster);
    statsService.getPlayerStatsBatch.mockResolvedValue(
      roster.map((player, index) => ({
        playerId: player.id,
        seasonAverages: { usagePercentage: index },
        gameLog: [],
      }))
    );

    const result = await teamsService.getSuggestedPlayers(LAKERS.id, 5);

    expect(result).toHaveLength(5);
  });

  it("returns an empty list without querying stats for a team with no roster", async () => {
    playersService.getTeamRoster.mockResolvedValue([]);

    const result = await teamsService.getSuggestedPlayers(LAKERS.id);

    expect(result).toEqual([]);
    expect(statsService.getPlayerStatsBatch).not.toHaveBeenCalled();
  });
});
