import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { fetchWatchlist, unfollowPlayer, updateWatchlistNote } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { WatchlistEntry } from "@/types/nba";
import { WatchlistBoard } from "./WatchlistBoard";

vi.mock("@/lib/nbaApi", () => ({
  fetchWatchlist: vi.fn(),
  unfollowPlayer: vi.fn(),
  updateWatchlistNote: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({ signInWithGoogle: vi.fn() }));

const THUNDER = {
  id: "team-okc",
  nbaTeamId: 1610612760,
  name: "Thunder",
  city: "Oklahoma City",
  abbreviation: "OKC",
  logoUrl: null,
};

function createEntry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    player: {
      id: "player-sga",
      nbaPlayerId: 1628983,
      firstName: "Shai",
      lastName: "Gilgeous-Alexander",
      position: "G",
      jerseyNumber: "2",
      headshotUrl: null,
      team: THUNDER,
    },
    note: null,
    followedAt: "2026-02-01T00:00:00.000Z",
    seasonAverages: { gamesPlayed: 40, pointsPerGame: 32.7, reboundsPerGame: 5.1, assistsPerGame: 6.4 },
    recentPoints: [
      { gameId: "g5", gameDate: "2026-02-05T00:00:00.000Z", points: 39 },
      { gameId: "g4", gameDate: "2026-02-03T00:00:00.000Z", points: 25 },
      { gameId: "g3", gameDate: "2026-02-01T00:00:00.000Z", points: 37 },
    ],
    ...overrides,
  };
}

function pageOf(entries: WatchlistEntry[]) {
  return { data: entries, page: 1, pageSize: 100, total: entries.length };
}

describe("WatchlistBoard", () => {
  beforeEach(() => {
    vi.mocked(fetchWatchlist).mockResolvedValue(pageOf([createEntry()]));
    vi.mocked(unfollowPlayer).mockResolvedValue({ playerId: "player-sga", removed: true });
    vi.mocked(updateWatchlistNote).mockResolvedValue({
      playerId: "player-sga",
      note: "Watch the FT rate",
      followedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("renders the real averages the API derived, not a placeholder", async () => {
    renderWithProviders(<WatchlistBoard />);

    expect(await screen.findByText("Shai Gilgeous-Alexander")).toBeInTheDocument();
    expect(screen.getByText("32.7")).toBeInTheDocument();
    expect(screen.getByText("5.1")).toBeInTheDocument();
    expect(screen.getByText("6.4")).toBeInTheDocument();
  });

  // The card used to link with the nba.com id, which /players/:id cannot
  // resolve — every one of those requests could only ever 404.
  it("links each player by the internal id the route actually resolves", async () => {
    renderWithProviders(<WatchlistBoard />);

    expect(await screen.findByRole("link", { name: "Shai Gilgeous-Alexander" })).toHaveAttribute(
      "href",
      "/players/player-sga"
    );
  });

  // The API sends most-recent-first; a left-to-right trend line that is not
  // reversed reads the streak backwards.
  it("plots the scoring trend oldest first", async () => {
    renderWithProviders(<WatchlistBoard />);

    expect(await screen.findByRole("img", { name: /points in the last 3 games: 37, 25, 39/i })).toBeInTheDocument();
  });

  it("removes a player from the board", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WatchlistBoard />);
    await screen.findByText("Shai Gilgeous-Alexander");

    vi.mocked(fetchWatchlist).mockResolvedValue(pageOf([]));
    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(unfollowPlayer).toHaveBeenCalledWith("player-sga"));
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("writes a scouting note against the follow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WatchlistBoard />);
    await screen.findByText("Shai Gilgeous-Alexander");

    await user.click(screen.getByRole("button", { name: /add note/i }));
    await user.type(screen.getByRole("textbox"), "Watch the FT rate");
    vi.mocked(fetchWatchlist).mockResolvedValue(pageOf([createEntry({ note: "Watch the FT rate" })]));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(updateWatchlistNote).toHaveBeenCalledWith("player-sga", "Watch the FT rate")
    );
    expect(await screen.findByText("Watch the FT rate")).toBeInTheDocument();
  });

  // The API models "no note" as null; saving "" would render an empty quote
  // block on the card forever.
  it("clears a note rather than storing an empty string", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchWatchlist).mockResolvedValue(pageOf([createEntry({ note: "Old note" })]));
    renderWithProviders(<WatchlistBoard />);

    await user.click(await screen.findByRole("button", { name: /edit note/i }));
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateWatchlistNote).toHaveBeenCalledWith("player-sga", null));
  });

  it("surfaces the server's message when a write is rejected", async () => {
    const user = userEvent.setup();
    vi.mocked(unfollowPlayer).mockRejectedValue(new ApiError("You are not following this player", 404));

    renderWithProviders(<WatchlistBoard />);
    await screen.findByText("Shai Gilgeous-Alexander");
    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not following this player/i);
  });

  it("asks a signed-out visitor to sign in rather than showing an error", async () => {
    vi.mocked(fetchWatchlist).mockRejectedValue(new ApiError("Sign in required", 401));

    renderWithProviders(<WatchlistBoard />);

    expect(await screen.findByRole("button", { name: /sign in to build one/i })).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  // Removing Add To Locker left no way to *start* a follow from this page, so
  // the empty state has to point at the one place that can.
  it("points an empty board at where players are found", async () => {
    vi.mocked(fetchWatchlist).mockResolvedValue(pageOf([]));

    renderWithProviders(<WatchlistBoard />);

    expect(await screen.findByRole("link", { name: /find a player/i })).toHaveAttribute("href", "/players");
  });

  // A followed rookie who has not debuted has no boxscores. A flat line at
  // zero would claim they played and scored nothing.
  it("says a player has no games rather than drawing a zero line", async () => {
    vi.mocked(fetchWatchlist).mockResolvedValue(pageOf([createEntry({ recentPoints: [] })]));

    renderWithProviders(<WatchlistBoard />);

    expect(await screen.findByText(/no games on record yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /points in the last/i })).not.toBeInTheDocument();
  });
});
