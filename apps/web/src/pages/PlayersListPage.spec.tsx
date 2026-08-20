import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayersListPage } from "./PlayersListPage";
import { fetchPlayers, fetchTeams } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { PagedResult, Player, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchPlayers: vi.fn(),
  fetchPlayerStats: vi.fn(),
  fetchTeams: vi.fn(),
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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1,
    firstName: "LeBron",
    lastName: "James",
    position: "F",
    heightInches: 81,
    weightLbs: 250,
    jerseyNumber: "23",
    headshotUrl: null,
    teamId: LAKERS.id,
    team: LAKERS,
    ...overrides,
  };
}

function pagedPlayers(data: Player[], total = data.length): PagedResult<Player> {
  return { data, page: 1, pageSize: 10, total };
}

describe("PlayersListPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders players once the query resolves", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("LeBron James")).toBeInTheDocument();
    expect(screen.getByText("Lakers")).toBeInTheDocument();
  });

  it("shows an em dash for a player with no team", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(fetchPlayers).mockResolvedValue(
      pagedPlayers([makePlayer({ id: "p2", lastName: "FreeAgent", team: null, teamId: null })])
    );

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("LeBron FreeAgent")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an ErrorState and retries the query when Retry is clicked", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(fetchPlayers).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("Could not load players.")).toBeInTheDocument();

    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("LeBron James")).toBeInTheDocument();
  });

  it("re-fetches players filtered by team when a team is selected", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
    const user = userEvent.setup();

    renderWithProviders(<PlayersListPage />);
    await screen.findByText("LeBron James");

    await user.selectOptions(screen.getByDisplayValue("All teams"), LAKERS.id);

    await waitFor(() => {
      expect(fetchPlayers).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamId: LAKERS.id, page: 1 })
      );
    });
  });

  it("debounces player search and combines it with existing filters", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()], 20));
    const user = userEvent.setup();

    renderWithProviders(<PlayersListPage />);
    await screen.findByText("LeBron James");

    await user.selectOptions(screen.getByDisplayValue("All teams"), LAKERS.id);
    await user.selectOptions(screen.getByDisplayValue("All positions"), "F");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchPlayers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    await user.type(screen.getByRole("searchbox", { name: "Search players" }), "  LeBron James  ");

    expect(fetchPlayers).not.toHaveBeenLastCalledWith(expect.objectContaining({ search: "LeBron James" }));

    await waitFor(() => {
      expect(fetchPlayers).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        teamId: LAKERS.id,
        position: "F",
        search: "LeBron James",
      });
    });
  });

  it("shows a clear message when no players match", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([]));

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("No players found.")).toBeInTheDocument();
  });
});
