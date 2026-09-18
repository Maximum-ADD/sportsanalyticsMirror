import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingMatchWidget } from "./LandingMatchWidget";
import { fetchGames } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Game, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
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

const KNICKS: Team = {
  id: "team-2",
  nbaTeamId: 2,
  name: "Knicks",
  abbreviation: "NYK",
  city: "New York",
  conference: "East",
  division: "Atlantic",
  logoUrl: null,
};

const GAME: Game = {
  id: "game-1",
  nbaGameId: "MOCK-GAME-1",
  gameDate: "2026-08-01T00:00:00.000Z",
  season: "2025-26",
  homeTeamId: LAKERS.id,
  awayTeamId: KNICKS.id,
  homeTeam: LAKERS,
  awayTeam: KNICKS,
  homeScore: 38,
  awayScore: 24,
  seasonType: "REGULAR",
  playoffRound: null,
};

const mockFetchGames = vi.mocked(fetchGames);

afterEach(() => {
  vi.resetAllMocks();
});

describe("LandingMatchWidget", () => {
  it("renders both teams and their scores once the game resolves", async () => {
    mockFetchGames.mockResolvedValue({ data: [GAME], page: 1, pageSize: 1, total: 1 });

    renderWithProviders(<LandingMatchWidget />);

    const card = await screen.findByRole("group", { name: /match updates/i });
    expect(card).toHaveTextContent("38");
    expect(card).toHaveTextContent("24");
    expect(card).toHaveTextContent(/LAL 38, NYK 24/);
  });

  it("fits inside the top bar as a compact single-row banner", async () => {
    mockFetchGames.mockResolvedValue({ data: [GAME], page: 1, pageSize: 1, total: 1 });

    renderWithProviders(<LandingMatchWidget />);

    // h-10 is the contract with LandingHeader's h-14 row — the banner must
    // sit inside the bar, not overhang it like the old h-36 card did.
    const banner = await screen.findByRole("group", { name: /match updates/i });
    expect(banner).toHaveClass("h-10");
    expect(banner).toHaveTextContent("VS");
    // Blends into the bar: no panel background or border of its own.
    expect(banner).not.toHaveClass("bg-surface-nav");
    expect(banner).not.toHaveClass("border");
  });

  it("only ever asks for a completed game, never an upcoming one with no score yet", async () => {
    mockFetchGames.mockResolvedValue({ data: [GAME], page: 1, pageSize: 1, total: 1 });

    renderWithProviders(<LandingMatchWidget />);

    await screen.findByRole("group", { name: /match updates/i });
    expect(mockFetchGames).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("does not claim the result is live", async () => {
    mockFetchGames.mockResolvedValue({ data: [GAME], page: 1, pageSize: 1, total: 1 });

    renderWithProviders(<LandingMatchWidget />);

    await screen.findByRole("group", { name: /match updates/i });
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
  });

  it("disappears rather than erroring when the API is unavailable", async () => {
    mockFetchGames.mockRejectedValue(new Error("network down"));

    const { container } = renderWithProviders(<LandingMatchWidget />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
