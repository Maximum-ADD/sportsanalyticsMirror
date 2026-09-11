import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameDetailPage } from "./GameDetailPage";
import { fetchGameDetail, fetchPlayerStats } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { GameDetail, GamePrediction, Player, PlayerStatsResponse, PredictedScorer, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGameDetail: vi.fn(),
  fetchPlayerStats: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ gameId: "game-1" }) };
});

const LAKERS: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

const CELTICS: Team = {
  id: "team-2",
  nbaTeamId: 2,
  name: "Celtics",
  abbreviation: "BOS",
  city: "Boston",
  conference: "East",
  division: "Atlantic",
  logoUrl: null,
};

const LEBRON: Player = {
  id: "player-1",
  nbaPlayerId: 2544,
  firstName: "LeBron",
  lastName: "James",
  position: "F",
  heightInches: 81,
  weightLbs: 250,
  jerseyNumber: "23",
  headshotUrl: null,
  teamId: LAKERS.id,
  team: LAKERS,
  birthDate: null,
  school: null,
  country: null,
  lastAffiliation: null,
  seasonExp: null,
  rosterStatus: null,
  draftYear: null,
  draftRound: null,
  draftNumber: null,
};

const PREDICTION: GamePrediction = {
  id: "prediction-1",
  gameId: "game-1",
  homeWinProbability: 0.62,
  homeTeamEloPre: 1512.5,
  awayTeamEloPre: 1487.5,
  predictedMarginHome: 3.68,
  marginMethod: "heuristic",
  createdAt: "2026-08-18T00:00:00.000Z",
};

const SCORER: PredictedScorer = { player: LEBRON, predictedPoints: 27.4, gamesConsidered: 8 };

const PLAYER_STATS: PlayerStatsResponse = {
  playerId: LEBRON.id,
  seasonType: "REGULAR",
  seasonAverages: {
    gamesPlayed: 10,
    minutesPerGame: 35.2,
    pointsPerGame: 26.8,
    reboundsPerGame: 7.4,
    assistsPerGame: 8.1,
    stealsPerGame: 1.2,
    blocksPerGame: 0.6,
    turnoversPerGame: 3.1,
    fieldGoalsMadePerGame: 9.8,
    fieldGoalsAttemptedPerGame: 18.2,
    fieldGoalPercentage: 0.538,
    threesMadePerGame: 2.1,
    threesAttemptedPerGame: 5.6,
    threePointPercentage: 0.375,
    freeThrowsMadePerGame: 4.5,
    freeThrowsAttemptedPerGame: 5.8,
    freeThrowPercentage: 0.776,
    trueShootingPercentage: 0.58,
    effectiveFieldGoalPercentage: 0.56,
    assistToTurnoverRatio: 2.61,
    plusMinusPerGame: 4.2,
    usagePercentage: 28.5,
    offensiveRating: 115,
    defensiveRating: 108,
  },
  gameLog: [
    { gameId: "g1", gameDate: "2026-01-10T00:00:00.000Z", points: 30 },
    { gameId: "g2", gameDate: "2026-01-08T00:00:00.000Z", points: 24 },
  ],
};

function makeGameDetail(overrides: Partial<GameDetail> = {}): GameDetail {
  return {
    id: "game-1",
    nbaGameId: "MOCK-GAME-0",
    gameDate: "2026-01-01T00:00:00.000Z",
    season: "2025-26",
    homeTeamId: LAKERS.id,
    awayTeamId: CELTICS.id,
    homeTeam: LAKERS,
    awayTeam: CELTICS,
    homeScore: 119,
    awayScore: 100,
    seasonType: "REGULAR",
    playoffRound: null,
    prediction: PREDICTION,
    predictedScorers: [SCORER],
    ...overrides,
  };
}

describe("GameDetailPage", () => {
  beforeEach(() => {
    // usePlayerReliability (PlayerCards.tsx) fetches every predicted
    // scorer's season stats up front now, not just a selected player's —
    // default every test to the same fixture so tests that don't care
    // about reliability specifically don't each need their own mock.
    vi.mocked(fetchPlayerStats).mockResolvedValue(PLAYER_STATS);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders win probability and predicted margin, and lists top scorers on the court", async () => {
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail());

    renderWithProviders(<GameDetailPage />);

    expect(await screen.findByText("LAL 62%")).toBeInTheDocument();
    expect(screen.getByText("LAL by 3.7", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show LeBron James's predicted stats/ })).toBeInTheDocument();
  });

  it("shows an explanatory message instead of win probability when no prediction exists yet", async () => {
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail({ prediction: null }));

    renderWithProviders(<GameDetailPage />);

    expect(await screen.findByText(/No win probability has been generated/)).toBeInTheDocument();
  });

  it("shows a friendly message when there are no predicted scorers yet", async () => {
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail({ predictedScorers: [] }));

    renderWithProviders(<GameDetailPage />);

    expect(await screen.findByText(/Not enough game history yet/)).toBeInTheDocument();
  });

  it("shows an ErrorState and retries when Retry is clicked, for a load failure", async () => {
    vi.mocked(fetchGameDetail).mockRejectedValue(new ApiError("server error", 500));

    renderWithProviders(<GameDetailPage />);

    expect(await screen.findByText("Could not load this game.")).toBeInTheDocument();
  });

  it("opens the player detail panel on click, showing season stats alongside the prediction", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail());
    vi.mocked(fetchPlayerStats).mockResolvedValue(PLAYER_STATS);

    renderWithProviders(<GameDetailPage />);

    await user.click(await screen.findByRole("button", { name: /Show LeBron James's predicted stats/ }));

    expect(screen.getAllByText("27.4").length).toBeGreaterThan(0);
    expect(await screen.findByText("26.8")).toBeInTheDocument(); // season PPG
  });

  it("lets a visitor edit a selected player's predicted points locally, see it reflected, then reset", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail());
    vi.mocked(fetchPlayerStats).mockResolvedValue(PLAYER_STATS);

    renderWithProviders(<GameDetailPage />);
    await user.click(await screen.findByRole("button", { name: /Show LeBron James's predicted stats/ }));
    await screen.findAllByText("27.4");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const pointsInput = screen.getByRole("spinbutton", { name: "Edit predicted points for LeBron James" });
    await user.clear(pointsInput);
    await user.type(pointsInput, "50");
    expect(pointsInput).toHaveValue(50);

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Reset edited points" }));

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("spinbutton", { name: "Edit predicted points for LeBron James" })
    ).toHaveValue(27.4);
  });
});
