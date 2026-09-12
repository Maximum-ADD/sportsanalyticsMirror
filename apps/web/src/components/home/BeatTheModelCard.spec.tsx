import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { fetchNextChallenge, fetchPickRecord, submitPick } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { ChallengeGame, GradedPick } from "@/types/nba";
import { BeatTheModelCard } from "./BeatTheModelCard";

vi.mock("@/lib/nbaApi", () => ({
  fetchNextChallenge: vi.fn(),
  submitPick: vi.fn(),
  fetchPickRecord: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({ signInWithGoogle: vi.fn() }));

const DENVER = { id: "team-den", name: "Nuggets", city: "Denver", abbreviation: "DEN", logoUrl: null };
const OKC = { id: "team-okc", name: "Thunder", city: "Oklahoma City", abbreviation: "OKC", logoUrl: null };
const MIAMI = { id: "team-mia", name: "Heat", city: "Miami", abbreviation: "MIA", logoUrl: null };

function createChallenge(overrides: Partial<ChallengeGame> = {}): ChallengeGame {
  return {
    gameId: "game-1",
    nbaGameId: "0022500612",
    gameDate: "2026-01-14T00:00:00.000Z",
    season: "2025-26",
    homeTeam: DENVER,
    awayTeam: OKC,
    prediction: {
      homeWinProbability: 0.36,
      homeTeamEloPre: 1548,
      awayTeamEloPre: 1612,
      predictedMarginHome: -5.1,
      marginMethod: "regression",
    },
    ...overrides,
  };
}

const GRADED: GradedPick = {
  id: "pick-1",
  gameId: "game-1",
  pickedTeamId: DENVER.id,
  outcome: "CORRECT",
  createdAt: "2026-01-15T00:00:00.000Z",
  finalScore: { homeScore: 121, awayScore: 118, winningTeamId: DENVER.id },
  model: {
    homeWinProbability: 0.36,
    predictedMarginHome: -5.1,
    homeTeamElo: 1548,
    awayTeamElo: 1612,
    favoriteTeamId: OKC.id,
    outcome: "MISSED",
  },
};

describe("BeatTheModelCard", () => {
  beforeEach(() => {
    vi.mocked(fetchNextChallenge).mockResolvedValue(createChallenge());
    vi.mocked(submitPick).mockResolvedValue(GRADED);
    vi.mocked(fetchPickRecord).mockRejectedValue(new ApiError("no session", 401));
  });

  it("withholds the final score until a call is made", async () => {
    renderWithProviders(<BeatTheModelCard />);

    expect(await screen.findByText(/result hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(/121/)).not.toBeInTheDocument();
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
  });

  it("reads the model's call from the favoured side, not always the home side", async () => {
    renderWithProviders(<BeatTheModelCard />);
    await screen.findByText(/result hidden/i);

    // homeWinProbability 0.36 means the model favours the AWAY team at 64%.
    // It appears twice by design: once in the model's sentence and once as the
    // probability bar's own label.
    expect(screen.getAllByText("OKC 64%")).toHaveLength(2);
    // The home side's 36% must never be presented as the model's call.
    expect(screen.queryByText("DEN 64%")).not.toBeInTheDocument();
  });

  it("grades the call and reveals the real score only afterwards", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BeatTheModelCard />);

    await user.click(await screen.findByRole("button", { name: "Denver" }));

    expect(await screen.findByText(/121\s*—\s*118/)).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText(/the model missed this one/i)).toBeInTheDocument();
    expect(submitPick).toHaveBeenCalledWith("game-1", DENVER.id);
  });

  // The reported bug: "when I click next call it gives me the same one".
  // The card used to hold a single hardcoded fixture, so advancing only reset
  // local state. It must now go back to the server, which excludes every game
  // this user has already called.
  it("fetches a genuinely different game on the next call", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNextChallenge)
      .mockResolvedValueOnce(createChallenge())
      .mockResolvedValueOnce(
        createChallenge({ gameId: "game-2", homeTeam: MIAMI, awayTeam: OKC })
      );

    renderWithProviders(<BeatTheModelCard />);
    await user.click(await screen.findByRole("button", { name: "Denver" }));
    await screen.findByText("Correct");

    await user.click(screen.getByRole("button", { name: /next call/i }));

    // A different game is now on screen, and the old one is gone — which is
    // only possible if the card went back to the server rather than resetting
    // local state. The exact refetch count is left unasserted because React
    // Query legitimately refetches on mount and invalidation.
    expect(await screen.findByRole("button", { name: "Miami" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Denver" })).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetchNextChallenge).mock.calls.length).toBeGreaterThan(1));
  });

  it("asks a signed-out visitor to sign in rather than showing an error", async () => {
    vi.mocked(fetchNextChallenge).mockRejectedValue(new ApiError("Sign in required", 401));

    renderWithProviders(<BeatTheModelCard />);

    expect(await screen.findByRole("button", { name: /sign in to play/i })).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it("says so plainly when every game has been called", async () => {
    vi.mocked(fetchNextChallenge).mockRejectedValue(new ApiError("Nothing left", 404));

    renderWithProviders(<BeatTheModelCard />);

    expect(await screen.findByText(/called every game we hold/i)).toBeInTheDocument();
  });

  it("surfaces the server's message when a call is rejected", async () => {
    const user = userEvent.setup();
    vi.mocked(submitPick).mockRejectedValue(
      new ApiError("You have already called this game", 409)
    );

    renderWithProviders(<BeatTheModelCard />);
    await user.click(await screen.findByRole("button", { name: "Denver" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already called this game/i);
  });

  it("shows the head-to-head record once the user has one", async () => {
    vi.mocked(fetchPickRecord).mockResolvedValue({
      wins: 12,
      losses: 7,
      total: 19,
      hitRate: 0.6316,
      modelWins: 11,
      modelLosses: 8,
      modelHitRate: 0.5789,
    });

    renderWithProviders(<BeatTheModelCard />);

    expect(await screen.findByText(/12–7/)).toBeInTheDocument();
    expect(screen.getByText(/11–8/)).toBeInTheDocument();
  });
});
