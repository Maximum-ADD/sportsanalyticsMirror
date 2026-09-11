import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayersListPage } from "./PlayersListPage";
import { fetchPlayers, fetchTeams } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
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
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
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

  it("has no automated accessibility violations", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
    const user = userEvent.setup();

    const { container } = renderWithProviders(<main><PlayersListPage /></main>);
    await screen.findByText("LeBron James");
    await user.type(screen.getByRole("searchbox", { name: "Search players" }), "L");
    await waitFor(() => {
      expect(fetchPlayers).toHaveBeenLastCalledWith(expect.objectContaining({ search: "L" }));
    });

    await expectNoAccessibilityViolations(container);
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
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), {
      target: { value: "  LeBron James  " },
    });

    expect(fetchPlayers).not.toHaveBeenLastCalledWith(expect.objectContaining({ search: "LeBron James" }));

    await waitFor(() => {
      expect(fetchPlayers).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        teamId: LAKERS.id,
        position: "F",
        search: "LeBron James",
        // The list now always states which segment it wants; the regular
        // season is the default and carries no `participated` filter.
        seasonType: "REGULAR",
      });
    });
  });

  it("shows a clear message when no players match", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([]));

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("No players found.")).toBeInTheDocument();
  });

  describe("season segments", () => {
    it("asks only for players who appeared in the segment when a postseason view is selected", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />, ["/players?segment=playoffs"]);

      await waitFor(() =>
        expect(fetchPlayers).toHaveBeenLastCalledWith(
          expect.objectContaining({ seasonType: "PLAYOFFS", participated: true })
        )
      );
    });

    it("does not narrow the regular season by participation, where it would remove nobody", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />);

      await waitFor(() => expect(fetchPlayers).toHaveBeenCalled());
      expect(fetchPlayers).toHaveBeenLastCalledWith(expect.not.objectContaining({ participated: true }));
    });

    it("refetches for the newly selected segment", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />);
      await screen.findByRole("radio", { name: "Finals" });

      await user.click(screen.getByRole("radio", { name: "Finals" }));

      await waitFor(() =>
        expect(fetchPlayers).toHaveBeenLastCalledWith(
          expect.objectContaining({ seasonType: "FINALS", participated: true })
        )
      );
    });

    it("explains an empty postseason list in terms of the segment", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([]));

      renderWithProviders(<PlayersListPage />, ["/players?segment=finals"]);

      expect(await screen.findByText("No players matched in the Finals.")).toBeInTheDocument();
    });

    it("carries the selected segment into the player profile link", async () => {
      // Reported in review: clicking a player from a Playoffs list landed on
      // their regular-season profile, so the navigation silently answered a
      // different question than the list was asking.
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />, ["/players?segment=playoffs"]);

      const playerLink = await screen.findByRole("link", { name: /LeBron James/ });
      expect(playerLink).toHaveAttribute("href", expect.stringContaining("segment=playoffs"));
    });

    it("carries the regular season into the link too, so the URL always states its segment", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />);

      const playerLink = await screen.findByRole("link", { name: /LeBron James/ });
      expect(playerLink).toHaveAttribute("href", expect.stringContaining("segment=regular"));
    });

    it("updates the player link when the segment changes", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />);
      await screen.findByRole("radio", { name: "Finals" });

      await user.click(screen.getByRole("radio", { name: "Finals" }));

      await waitFor(() =>
        expect(screen.getByRole("link", { name: /LeBron James/ })).toHaveAttribute(
          "href",
          expect.stringContaining("segment=finals")
        )
      );
    });
  });
});
