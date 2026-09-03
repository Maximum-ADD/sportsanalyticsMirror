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
  fetchPlayerPrediction: vi.fn(),
  fetchPlayers: vi.fn(),
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
        birthDate: null,
        school: null,
        country: null,
        lastAffiliation: null,
        seasonExp: null,
        rosterStatus: null,
        draftYear: null,
        draftRound: null,
        draftNumber: null,
      },
    },
  ],
};

const CURRY: Lineup["slots"][number] = {
  id: "slot-2",
  lineupId: "lineup-1",
  playerId: "player-2",
  predictedFantasyPoints: 38.5,
  salary: 8800,
  player: {
    id: "player-2",
    nbaPlayerId: 2,
    firstName: "Stephen",
    lastName: "Curry",
    position: "G",
    heightInches: 75,
    weightLbs: 185,
    jerseyNumber: "30",
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
  },
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

  it("lets a visitor remove a player from the lineup locally, re-summing totals, then reset", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Anthony Davis");

    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    await user.click(screen.getByRole("button", { name: "Remove Anthony Davis from the lineup" }));

    expect(screen.queryByText("Anthony Davis")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(await screen.findByText("Anthony Davis")).toBeInTheDocument();
    expect(screen.getByText("219.4")).toBeInTheDocument();
  });

  it("warns when an edited lineup no longer meets the optimizer's position requirements", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue({ ...LINEUP, slots: [...LINEUP.slots, CURRY] });

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Stephen Curry");

    expect(screen.queryByText(/doesn't meet the optimizer's position requirements/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    await user.click(screen.getByRole("button", { name: "Remove Stephen Curry from the lineup" }));

    expect(screen.getByText(/needs at least a guard\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.queryByText(/doesn't meet the optimizer's position requirements/)).not.toBeInTheDocument();
  });

  it("lets a visitor edit the budget cap locally and reflects it in the over-budget check", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLatestLineup).mockResolvedValue(LINEUP);

    renderWithProviders(<OptimizerPage />);
    await screen.findByText("Anthony Davis");

    await user.click(screen.getByRole("button", { name: "Edit lineup" }));
    const budgetInput = screen.getByRole("spinbutton", { name: "Edit budget cap" });
    await user.clear(budgetInput);
    await user.type(budgetInput, "10000");

    // Salary Used ($50,000) now exceeds the edited $10,000 budget.
    expect(screen.getByText("$50,000")).toHaveClass("text-red-400");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("$50,000")).not.toHaveClass("text-red-400");
  });
});
