import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import {
  fetchLeaderboard,
  fetchModelAccuracy,
  fetchNextChallenge,
  fetchPickRecord,
  fetchSavedComparisons,
  fetchTeamResults,
  fetchWatchlist,
} from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { HomePage } from "./HomePage";

// EVERY module on this page reads the live API now — there is no placeholder
// data left to render from, so every one of these has to be mocked for the
// page to mount at all. This spec covers how the page is composed; each
// module's own behaviour is covered by its own spec.
vi.mock("@/lib/nbaApi", () => ({
  fetchModelAccuracy: vi.fn(),
  fetchNextChallenge: vi.fn(),
  submitPick: vi.fn(),
  fetchPickRecord: vi.fn(),
  fetchLeaderboard: vi.fn(),
  fetchWatchlist: vi.fn(),
  fetchTeamResults: vi.fn(),
  fetchSavedComparisons: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({ unfollowPlayer: vi.fn(), fetchMe: vi.fn(), fetchSavedLineups: vi.fn() }));

// YourTeamsList reads the profile through useMe(), which gates its own query
// on BetterAuth's useSession — so a signed-out session is what makes the
// module render its prompt rather than hang on a query that never fires.
vi.mock("@/lib/authClient", () => ({
  signInWithGoogle: vi.fn(),
  useSession: () => ({ data: null, isPending: false }),
}));

const MODEL_ACCURACY_REPORT = {
  accuracy: 0.613,
  brierScore: 0.221,
  homeBaselineAccuracy: 0.552,
  gamesEvaluated: 284,
  forwardPredictionCount: 0,
  calibration: [
    { band: "50-60", meanPredicted: 0.551, actualWinRate: 0.529, gamesInBand: 87 },
    { band: "90-100", meanPredicted: 0.926, actualWinRate: 0.905, gamesInBand: 21 },
  ],
};

beforeEach(() => {
  vi.mocked(fetchModelAccuracy).mockResolvedValue(MODEL_ACCURACY_REPORT);
  vi.mocked(fetchLeaderboard).mockResolvedValue({
    minimumCallsRequired: 5,
    entries: [{ rank: 1, kind: "model", name: "Elo model", calls: 231, correct: 148, hitRate: 0.641 }],
  });
  // Signed out is the honest default for a test that is not about auth.
  vi.mocked(fetchNextChallenge).mockRejectedValue(new ApiError("Sign in required", 401));
  vi.mocked(fetchPickRecord).mockRejectedValue(new ApiError("Sign in required", 401));
  vi.mocked(fetchWatchlist).mockRejectedValue(new ApiError("Sign in required", 401));
  vi.mocked(fetchTeamResults).mockRejectedValue(new ApiError("Sign in required", 401));
  vi.mocked(fetchSavedComparisons).mockRejectedValue(new ApiError("Sign in required", 401));
});

describe("HomePage", () => {
  it("has no automated accessibility violations", async () => {
    const { container } = renderWithProviders(<main><HomePage /></main>);

    await expectNoAccessibilityViolations(container);
  });

  it("renders as an app page, not a second landing hero", () => {
    renderWithProviders(<HomePage />);

    // The bug this page exists to fix: LandingPage's CTA appeared to do
    // nothing because the old /home was a rebuild of its hero, right down to
    // a second button reading "Get Started". Nothing behind the app shell
    // should offer to start what the user already started.
    expect(screen.queryByText(/get started/i)).not.toBeInTheDocument();
    expect(screen.getByText(/beat the model/i)).toBeInTheDocument();
  });

  it("shows the personalized modules that require an account", async () => {
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("heading", { name: /your watchlist/i })).toBeInTheDocument();
    // Singular, and no team named: the heading now comes from the user's own
    // favoriteTeam, and this spec renders signed out.
    expect(screen.getByRole("heading", { name: /^your team$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /saved shelf/i })).toBeInTheDocument();
  });

  // The user's verdict on both: "no functionality". Add To Locker searched
  // nothing and Jump Back In listed views nobody recorded, so neither is on
  // the page. The components are kept for when there is something behind
  // them — this asserts only that the page does not render them today.
  it("does not render the two modules that had nothing behind them", async () => {
    renderWithProviders(<HomePage />);
    await screen.findByRole("heading", { name: /your watchlist/i });

    expect(screen.queryByRole("heading", { name: /add to locker/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /jump back in/i })).not.toBeInTheDocument();
  });

  it("puts the accuracy leaderboard on the page with the model on it", async () => {
    renderWithProviders(<HomePage />);

    // The section heading renders inside the loading shell too, so awaiting
    // the model's row is what actually proves the data arrived.
    expect(await screen.findByText("Elo model")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /accuracy leaderboard/i })).toBeInTheDocument();
    expect(screen.getByText("64.1%")).toBeInTheDocument();
  });

  it("publishes the model's accuracy with the baseline that makes it mean something", async () => {
    renderWithProviders(<HomePage />);

    expect(await screen.findByText("61.3%")).toBeInTheDocument();
    expect(screen.getByText(/baseline · always home/i)).toBeInTheDocument();
    expect(screen.getByText("55.2%")).toBeInTheDocument();
    // Saying this out loud beats marketing a backtest as a track record.
    expect(screen.getByText(/0 forward predictions so far/i)).toBeInTheDocument();
  });

  it("flags a calibration bucket too thin to read as fact", async () => {
    renderWithProviders(<HomePage />);

    expect(await screen.findByText(/21 · n too small/i)).toBeInTheDocument();
  });

  // An empty database is a real state, not a zero: reporting 0% accuracy
  // would claim the model got everything wrong.
  it("renders a dash rather than 0% when there is nothing to score yet", async () => {
    vi.mocked(fetchModelAccuracy).mockResolvedValue({
      accuracy: null,
      brierScore: null,
      homeBaselineAccuracy: null,
      gamesEvaluated: 0,
      forwardPredictionCount: 0,
      calibration: [{ band: "50-60", meanPredicted: null, actualWinRate: null, gamesInBand: 0 }],
    });

    renderWithProviders(<HomePage />);

    expect(await screen.findByText(/scored over 0 completed games/i)).toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  // Regression: placeholder cards used to link with `nbaPlayerId` (the nba.com
  // id) and with literal "placeholder-jokic" strings, but /players/:id,
  // /teams/:id and /games/:id all resolve an INTERNAL uuid — so opening /home
  // fired a burst of requests that could only ever 404.
  it("never links a placeholder card to a route that cannot resolve", async () => {
    const { container } = renderWithProviders(<HomePage />);
    await screen.findByRole("heading", { name: /your watchlist/i });

    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");

    expect(hrefs.filter((href) => href.includes("placeholder-"))).toEqual([]);
    expect(hrefs.filter((href) => /^\/(players|teams|games)\/\d+$/.test(href))).toEqual([]);
    expect(hrefs.filter((href) => /^\/compare\?ids=\d+(,\d+)*$/.test(href))).toEqual([]);
  });
});
