import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveGamePage } from "./LiveGamePage";
import { ApiError } from "@/lib/apiClient";
import { fetchLiveGame } from "@/lib/liveGamesApi";
import { buildLiveGameDetail, buildLiveGameSummary, buildLivePlay } from "@/test/liveGameFixtures";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/liveGamesApi", () => ({
  fetchLiveGame: vi.fn(),
}));

function renderLiveGamePage(gameId = "0012600028") {
  return renderWithProviders(
    <Routes>
      <Route path="/live/:gameId" element={<LiveGamePage />} />
    </Routes>,
    [`/live/${gameId}`]
  );
}

// 21:00 SAST on the same Tuesday as the fixture game, so its times need no date.
const NOW = new Date("2026-10-06T19:00:00Z");

describe("LiveGamePage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads the game named in the URL", async () => {
    vi.mocked(fetchLiveGame).mockResolvedValue(buildLiveGameDetail());
    renderLiveGamePage("0012600028");

    expect(await screen.findByRole("heading", { level: 1, name: "Los Angeles Lakers at Sacramento Kings" })).toBeInTheDocument();
    expect(fetchLiveGame).toHaveBeenCalledWith("0012600028");
  });

  it("shows a live game's state and its last five minutes of play", async () => {
    const tieBreakingPlay = buildLivePlay({ description: "N. Clifford 7' putback Layup (23 PTS)", awayScore: 68, homeScore: 70 });
    vi.mocked(fetchLiveGame).mockResolvedValue(buildLiveGameDetail({ recentPlays: [tieBreakingPlay] }));
    renderLiveGamePage();

    const plays = await screen.findByRole("region", { name: "Last 5 minutes of play" });

    expect(screen.getAllByText("Q3 · 4:12").length).toBeGreaterThan(0);
    expect(within(plays).getByText("N. Clifford 7' putback Layup (23 PTS)")).toBeInTheDocument();
    expect(within(plays).getByText("Q3 4:12")).toBeInTheDocument();
    expect(within(plays).getByText("68–70")).toBeInTheDocument();
  });

  it("shows each side's box score, one row per player who played", async () => {
    vi.mocked(fetchLiveGame).mockResolvedValue(buildLiveGameDetail());
    renderLiveGamePage();

    const homeBoxScore = await screen.findByRole("table", { name: "Sacramento Kings box score" });
    const hunterRow = within(homeBoxScore).getByRole("row", { name: /D\. Hunter/ });

    expect(within(hunterRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "13:27",
      "3",
      "0",
      "0",
      "0",
      "0",
      "0-0",
      "0-0",
      "3-3",
      "-16",
    ]);
    expect(screen.getByRole("table", { name: "Los Angeles Lakers box score" })).toBeInTheDocument();
  });

  it("shows a finished game's result and box score, without a play-by-play", async () => {
    vi.mocked(fetchLiveGame).mockResolvedValue(
      buildLiveGameDetail({
        game: buildLiveGameSummary({ status: "final", statusText: "Final", period: 4, endedAt: "2026-10-06T04:42:50.769Z" }),
        recentPlays: null,
      })
    );
    renderLiveGamePage();

    expect(await screen.findByText("Final")).toBeInTheDocument();
    expect(screen.getByText(/Start 04:00 · End 06:42 SAST/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Last 5 minutes of play" })).not.toBeInTheDocument();
  });

  it("says so when a live game's play-by-play can't be read", async () => {
    vi.mocked(fetchLiveGame).mockResolvedValue(buildLiveGameDetail({ recentPlays: null }));
    renderLiveGamePage();

    expect(await screen.findByText("The play-by-play is unavailable right now.")).toBeInTheDocument();
  });

  it("explains a game that has left the live window, with a way back", async () => {
    vi.mocked(fetchLiveGame).mockRejectedValue(new ApiError("Request to /v1/live/games/0012600028 failed with status 404", 404));
    renderLiveGamePage();

    expect(await screen.findByRole("heading", { name: "Not on the live page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See live games" })).toHaveAttribute("href", "/live");
    expect(fetchLiveGame).toHaveBeenCalledTimes(1);
  });
});
