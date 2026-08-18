import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictionsPage } from "./PredictionsPage";
import { fetchGamePrediction, fetchGames } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Game, GamePrediction, PagedResult, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
  fetchGamePrediction: vi.fn(),
}));

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

const GAME: Game = {
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
};

const GAMES_PAGE: PagedResult<Game> = { data: [GAME], page: 1, pageSize: 25, total: 1 };

const PREDICTION: GamePrediction = {
  id: "prediction-1",
  gameId: GAME.id,
  homeWinProbability: 0.62,
  homeTeamEloPre: 1512.5,
  awayTeamEloPre: 1487.5,
  predictedMarginHome: 3.68,
  marginMethod: "heuristic",
  createdAt: "2026-08-18T00:00:00.000Z",
};

describe("PredictionsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders each game's win probability and margin once both queries resolve", async () => {
    vi.mocked(fetchGames).mockResolvedValue(GAMES_PAGE);
    vi.mocked(fetchGamePrediction).mockResolvedValue(PREDICTION);

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByText("LAL 62%", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("LAL by 3.7", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("heuristic").length).toBeGreaterThan(0);
  });

  it("shows a friendly per-row message when a game has no prediction yet (404)", async () => {
    vi.mocked(fetchGames).mockResolvedValue(GAMES_PAGE);
    vi.mocked(fetchGamePrediction).mockRejectedValue(new ApiError("not found", 404));

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByText("No prediction yet")).toBeInTheDocument();
  });

  it("shows an ErrorState and retries when Retry is clicked, if the games list itself fails to load", async () => {
    vi.mocked(fetchGames).mockRejectedValue(new ApiError("server error", 500));

    renderWithProviders(<PredictionsPage />);

    expect(await screen.findByText("Could not load games.")).toBeInTheDocument();
  });
});
