import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentResultWidget } from "./RecentResultWidget";
import { fetchGames } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Game, Team } from "@/types/nba";
import { useSession } from "@/lib/authClient";

vi.mock("@/lib/nbaApi", () => ({
  fetchGames: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
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
  nbaGameId: "MOCK-GAME-1",
  gameDate: "2026-08-01T00:00:00.000Z",
  season: "2025-26",
  homeTeamId: LAKERS.id,
  awayTeamId: CELTICS.id,
  homeTeam: LAKERS,
  awayTeam: CELTICS,
  homeScore: 110,
  awayScore: 102,
};

describe("RecentResultWidget", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "player@example.com" } },
      isPending: false,
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the most recent game's score, labelled 'Recent Result' rather than 'Live'", async () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [GAME], page: 1, pageSize: 1, total: 1 });

    renderWithProviders(<RecentResultWidget />);

    expect(await screen.findByText("Recent Result")).toBeInTheDocument();
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
  });

  it("does not request protected game data for a logged-out visitor", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);

    const { container } = renderWithProviders(<RecentResultWidget />);

    expect(container).toBeEmptyDOMElement();
    expect(fetchGames).not.toHaveBeenCalled();
  });

  it("exposes the score to screen readers as a sentence, grouped under the visible caption", async () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [GAME], page: 1, pageSize: 1, total: 1 });

    renderWithProviders(<RecentResultWidget />);

    const group = await screen.findByRole("group", { name: "Recent Result" });
    expect(group).toHaveTextContent("LAL 110, BOS 102");
  });

  it("renders nothing when there are no games yet", async () => {
    vi.mocked(fetchGames).mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0 });

    const { container } = renderWithProviders(<RecentResultWidget />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing on error, rather than a broken widget in the navbar", async () => {
    vi.mocked(fetchGames).mockRejectedValue(new Error("network down"));

    const { container } = renderWithProviders(<RecentResultWidget />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
