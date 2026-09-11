import type { Game, GamePrediction, Team } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamsService } from "./teams.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

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
    teamsService = new TeamsService(prisma as unknown as PrismaService);
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
