import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveGamesPage } from "./LiveGamesPage";
import { ApiError } from "@/lib/apiClient";
import { fetchLiveGames, type LiveGamesBoard } from "@/lib/liveGamesApi";
import { buildLiveGameSummary, buildUpcomingGame } from "@/test/liveGameFixtures";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/liveGamesApi", () => ({
  fetchLiveGames: vi.fn(),
}));

// 21:00 SAST on Tuesday 6 October 2026: the morning's games are recent, the
// night's games are upcoming.
const NOW = new Date("2026-10-06T19:00:00Z");

function buildBoard(overrides: Partial<LiveGamesBoard> = {}): LiveGamesBoard {
  return { live: [], upcoming: [], recent: [], ...overrides };
}

describe("LiveGamesPage", () => {
  beforeEach(() => {
    // Only Date is faked: countdowns and "today" read it, while React Query
    // and testing-library keep their real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows a loading state until the games arrive", () => {
    vi.mocked(fetchLiveGames).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<LiveGamesPage />);

    expect(screen.getByRole("status", { name: "Loading live games" })).toBeInTheDocument();
  });

  it("shows a live game's score and state, linking to its box score", async () => {
    vi.mocked(fetchLiveGames).mockResolvedValue(buildBoard({ live: [buildLiveGameSummary()] }));
    renderWithProviders(<LiveGamesPage />);

    const liveSection = await screen.findByRole("region", { name: "Live (1)" });
    const liveCard = within(liveSection).getByRole("link");

    expect(liveCard).toHaveAttribute("href", "/live/0012600028");
    expect(within(liveCard).getByText("Live")).toBeInTheDocument();
    expect(within(liveCard).getByText("Q3 · 4:12")).toBeInTheDocument();
    expect(within(liveCard).getByText("68")).toBeInTheDocument();
    expect(within(liveCard).getByText("Start 04:00 SAST")).toBeInTheDocument();
  });

  it("shows upcoming games with a countdown and a dated tip-off, and no score", async () => {
    vi.mocked(fetchLiveGames).mockResolvedValue(buildBoard({ upcoming: [buildUpcomingGame()] }));
    renderWithProviders(<LiveGamesPage />);

    const upcomingSection = await screen.findByRole("region", { name: "Upcoming (1)" });
    const upcomingCard = within(upcomingSection).getByRole("article");

    expect(within(upcomingCard).getByText("Upcoming")).toBeInTheDocument();
    expect(within(upcomingCard).getByText("in 4h")).toBeInTheDocument();
    expect(within(upcomingCard).getByText("Tip-off Wed 7 Oct 01:00 SAST")).toBeInTheDocument();
    expect(within(upcomingCard).getByText("BKN")).toBeInTheDocument();
    expect(within(upcomingSection).queryByRole("link")).not.toBeInTheDocument();
  });

  it("says a game past its start time is starting soon, and shows the NBA's note for one off track", async () => {
    const lateGame = buildUpcomingGame({ gameId: "0012600025", startsAt: "2026-10-06T18:50:00Z" });
    const postponedGame = buildUpcomingGame({ gameId: "0012600026", startsAt: "2026-10-07T00:00:00Z", statusNote: "PPD" });
    vi.mocked(fetchLiveGames).mockResolvedValue(buildBoard({ upcoming: [lateGame, postponedGame] }));
    renderWithProviders(<LiveGamesPage />);

    const upcomingSection = await screen.findByRole("region", { name: "Upcoming (2)" });

    expect(within(upcomingSection).getByText("Starting soon")).toBeInTheDocument();
    expect(within(upcomingSection).getByText("PPD")).toBeInTheDocument();
  });

  it("shows a recent game's result, with how it ended and when", async () => {
    const overtimeFinal = buildLiveGameSummary({
      gameId: "0012600024",
      status: "final",
      statusText: "Final",
      period: 5,
      gameClock: "PT00M00.00S",
      startsAt: "2026-10-06T00:00:00Z",
      endedAt: "2026-10-06T02:34:45.844Z",
      homeTeam: { teamId: 1610612749, tricode: "MIL", city: "Milwaukee", name: "Bucks", score: 97 },
      awayTeam: { teamId: 1610612750, tricode: "MIN", city: "Minnesota", name: "Timberwolves", score: 116 },
    });
    vi.mocked(fetchLiveGames).mockResolvedValue(buildBoard({ recent: [overtimeFinal] }));
    renderWithProviders(<LiveGamesPage />);

    const recentCard = within(await screen.findByRole("region", { name: "Recent (1)" })).getByRole("link");

    expect(recentCard).toHaveAttribute("href", "/live/0012600024");
    expect(within(recentCard).getByText("Final/OT")).toBeInTheDocument();
    expect(within(recentCard).getByText("Start 02:00 · End 04:34 SAST")).toBeInTheDocument();
  });

  it("answers each empty section plainly instead of hiding it", async () => {
    vi.mocked(fetchLiveGames).mockResolvedValue(buildBoard());
    renderWithProviders(<LiveGamesPage />);

    expect(await screen.findByText("Nothing is live right now.")).toBeInTheDocument();
    expect(screen.getByText("No games in the next 24 hours.")).toBeInTheDocument();
    expect(screen.getByText("No games finished in the last 18 hours.")).toBeInTheDocument();
  });

  it("says the stats are the NBA's own, not derived from this platform's events", async () => {
    vi.mocked(fetchLiveGames).mockResolvedValue(buildBoard());
    renderWithProviders(<LiveGamesPage />);

    expect(await screen.findByText(/come straight from the NBA's live feed/)).toBeInTheDocument();
  });

  it("offers a retry when the live feed is unavailable", async () => {
    vi.mocked(fetchLiveGames)
      .mockRejectedValueOnce(new ApiError("Request to /v1/live/games failed with status 503", 503))
      .mockResolvedValueOnce(buildBoard());
    const user = userEvent.setup();
    renderWithProviders(<LiveGamesPage />);

    expect(await screen.findByText(/Live NBA data is unavailable right now/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Nothing is live right now.")).toBeInTheDocument();
  });
});
