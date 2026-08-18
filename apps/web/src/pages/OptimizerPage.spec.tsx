import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptimizerPage } from "./OptimizerPage";
import { fetchLatestLineup } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Lineup, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchLatestLineup: vi.fn(),
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

const LINEUP: Lineup = {
  id: "lineup-1",
  totalPredictedPoints: 219.4,
  totalSalary: 50_000,
  budget: 50_000,
  createdAt: "2026-08-13T00:00:00.000Z",
  slots: [
    {
      id: "slot-1",
      lineupId: "lineup-1",
      playerId: "player-1",
      predictedFantasyPoints: 43.28,
      salary: 9900,
      player: {
        id: "player-1",
        nbaPlayerId: 1,
        firstName: "Anthony",
        lastName: "Davis",
        position: "F-C",
        heightInches: 82,
        weightLbs: 253,
        jerseyNumber: "3",
        headshotUrl: null,
        teamId: LAKERS.id,
        team: LAKERS,
      },
    },
  ],
};

describe("OptimizerPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the lineup summary and players once the query resolves", async () => {
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText("Anthony Davis")).toBeInTheDocument();
    expect(screen.getByText("219.4")).toBeInTheDocument();
    // Salary Used and Budget Cap are both $50,000 in this fixture.
    expect(screen.getAllByText("$50,000")).toHaveLength(2);
  });

  it("shows a friendly empty state when no lineup has been generated yet (404)", async () => {
    vi.mocked(fetchLatestLineup).mockRejectedValue(new ApiError("not found", 404));

    renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText(/No lineup has been generated yet/)).toBeInTheDocument();
  });

  it("shows an ErrorState and retries the query when Retry is clicked, for a non-404 error", async () => {
    vi.mocked(fetchLatestLineup).mockRejectedValue(new ApiError("server error", 500));
    const user = userEvent.setup();

    renderWithProviders(<OptimizerPage />);

    expect(await screen.findByText("Could not load the optimized lineup.")).toBeInTheDocument();

    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Anthony Davis")).toBeInTheDocument();
  });
});
