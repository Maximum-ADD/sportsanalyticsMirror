import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { fetchSavedComparisons, fetchSavedLineups } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { LineupDrift, Player, SavedComparison, SavedLineup } from "@/types/nba";
import { SavedShelfCard } from "./SavedShelfCard";

vi.mock("@/lib/nbaApi", () => ({
  fetchSavedComparisons: vi.fn(),
  fetchSavedLineups: vi.fn(),
}));

function createPlayer(id: string, nbaPlayerId: number, lastName: string): Player {
  return {
    id,
    nbaPlayerId,
    firstName: "Test",
    lastName,
    position: "G",
    heightInches: null,
    weightLbs: null,
    jerseyNumber: null,
    headshotUrl: null,
    team: null,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
  } as unknown as Player;
}

const COMPARISON: SavedComparison = {
  id: "cmp-1",
  name: "MVP ladder",
  createdAt: "2026-02-01T00:00:00.000Z",
  players: [
    { playerId: "player-a", position: 0, player: createPlayer("player-a", 1628983, "Alpha") },
    { playerId: "player-b", position: 1, player: createPlayer("player-b", 203999, "Beta") },
  ],
};

function createLineup(drift: LineupDrift): SavedLineup {
  return {
    id: "lineup-1",
    name: "Value Core",
    createdAt: "2026-02-01T00:00:00.000Z",
    sourceLineupId: "src-1",
    totalPredictedPointsAtSave: 214.8,
    budgetAtSave: 50_000,
    slots: [],
    drift,
  };
}

function page<T>(rows: T[]) {
  return { data: rows, page: 1, pageSize: 5, total: rows.length };
}

const NO_DRIFT: LineupDrift = { pointsDelta: 0, salaryDelta: 0, isOverBudget: false };

describe("SavedShelfCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSavedComparisons).mockResolvedValue(page([COMPARISON]));
    vi.mocked(fetchSavedLineups).mockResolvedValue(page([createLineup(NO_DRIFT)]));
  });

  it("lists a saved comparison and links it to the real player ids", async () => {
    renderWithProviders(<SavedShelfCard />);

    const link = await screen.findByRole("link", { name: "MVP ladder" });
    expect(link).toHaveAttribute("href", "/compare?ids=player-a,player-b");
    expect(screen.getByText("2 players")).toBeInTheDocument();
  });

  it("shows a saved lineup with the figures frozen at save time", async () => {
    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByRole("link", { name: "Value Core" })).toBeInTheDocument();
    expect(screen.getByText(/214\.8 pts/)).toBeInTheDocument();
    expect(screen.getByText(/\$50,000/)).toBeInTheDocument();
  });

  it("says a lineup is unchanged when nothing has moved", async () => {
    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByText(/unchanged since you saved it/i)).toBeInTheDocument();
  });

  // The deltas are signed and both directions are real. The placeholder this
  // replaced said "up X pts" unconditionally, which would report a fall as a
  // rise the moment real data arrived.
  it("reads a rise as up", async () => {
    vi.mocked(fetchSavedLineups).mockResolvedValue(
      page([createLineup({ pointsDelta: 7.5, salaryDelta: 800, isOverBudget: false })])
    );

    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByText(/up 7\.5 pts/i)).toBeInTheDocument();
    expect(screen.queryByText(/down/i)).not.toBeInTheDocument();
  });

  it("reads a fall as down rather than as a rise", async () => {
    vi.mocked(fetchSavedLineups).mockResolvedValue(
      page([createLineup({ pointsDelta: -4.2, salaryDelta: -500, isOverBudget: false })])
    );

    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByText(/down 4\.2 pts/i)).toBeInTheDocument();
    expect(screen.getByText(/less salary/i)).toBeInTheDocument();
  });

  it("calls out a lineup that has drifted over the cap", async () => {
    vi.mocked(fetchSavedLineups).mockResolvedValue(
      page([createLineup({ pointsDelta: 1, salaryDelta: 2000, isOverBudget: true })])
    );

    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByText(/now over cap/i)).toBeInTheDocument();
  });

  it("points an empty shelf at the pages that fill it", async () => {
    vi.mocked(fetchSavedComparisons).mockResolvedValue(page([]));
    vi.mocked(fetchSavedLineups).mockResolvedValue(page([]));

    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByRole("link", { name: /compare/i })).toHaveAttribute("href", "/compare");
    expect(screen.getByRole("link", { name: /optimizer/i })).toHaveAttribute("href", "/optimizer");
  });

  it("asks a signed-out visitor to sign in rather than showing an error", async () => {
    vi.mocked(fetchSavedComparisons).mockRejectedValue(new ApiError("Sign in required", 401));
    vi.mocked(fetchSavedLineups).mockRejectedValue(new ApiError("Sign in required", 401));

    renderWithProviders(<SavedShelfCard />);

    expect(await screen.findByText(/sign in to keep named comparisons/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it("retries both queries when a genuine failure is retried", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSavedComparisons).mockRejectedValue(new ApiError("boom", 500));
    vi.mocked(fetchSavedLineups).mockRejectedValue(new ApiError("boom", 500));

    renderWithProviders(<SavedShelfCard />);

    await user.click(await screen.findByRole("button", { name: /try again/i }));
    expect(fetchSavedComparisons).toHaveBeenCalled();
    expect(fetchSavedLineups).toHaveBeenCalled();
  });
});
