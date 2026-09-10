import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameDetailPage } from "./GameDetailPage";
import { fetchGameDetail } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { GameDetail, GamePrediction, Player, PredictedScorer, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGameDetail: vi.fn(),
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
    prediction: PREDICTION,
    predictedScorers: [SCORER],
    ...overrides,
  };
}

describe("GameDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders win probability, predicted margin, and top scorers once the query resolves", async () => {
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail());

    renderWithProviders(<GameDetailPage />);

    expect(await screen.findByText("LAL 62%")).toBeInTheDocument();
    expect(screen.getByText("LAL by 3.7", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("LeBron James")).toBeInTheDocument();
    expect(screen.getByText("27.4")).toBeInTheDocument();
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

  it("lets a visitor edit a predicted scorer's points locally, see it reflected, then reset", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchGameDetail).mockResolvedValue(makeGameDetail());

    renderWithProviders(<GameDetailPage />);
    await screen.findByText("27.4");

    await user.click(screen.getByRole("button", { name: "Edit predicted points" }));
    const pointsInput = screen.getByRole("spinbutton", { name: "Edit predicted points for LeBron James" });
    await user.clear(pointsInput);
    await user.type(pointsInput, "50");
    expect(pointsInput).toHaveValue(50);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      screen.getByRole("spinbutton", { name: "Edit predicted points for LeBron James" })
    ).toHaveValue(27.4);
  });
});
