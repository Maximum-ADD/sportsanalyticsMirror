import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayersListPage } from "./PlayersListPage";
import { fetchPlayerLeaders, fetchPlayerStatsBatch, fetchPlayerStatsBatchInChunks, fetchPlayers, fetchTeams } from "@/lib/nbaApi";
import { useSession } from "@/lib/authClient";
import { fetchMe, followPlayer, unfollowPlayer } from "@/lib/meApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type { MeProfile, PagedResult, Player, SeasonAverages, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchPlayers: vi.fn(),
  fetchPlayerStatsBatch: vi.fn(),
  fetchPlayerStatsBatchInChunks: vi.fn(),
  fetchPlayerLeaders: vi.fn(),
  fetchTeams: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/meApi", () => ({
  fetchMe: vi.fn(),
  followPlayer: vi.fn(),
  unfollowPlayer: vi.fn(),
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

function makeSeasonAverages(overrides: Partial<SeasonAverages> = {}): SeasonAverages {
  return {
    gamesPlayed: 10,
    minutesPerGame: 34.5,
    pointsPerGame: 27.1,
    reboundsPerGame: 7.4,
    assistsPerGame: 8.2,
    stealsPerGame: 1.3,
    blocksPerGame: 0.6,
    turnoversPerGame: 3.1,
    fieldGoalsMadePerGame: 9.9,
    fieldGoalsAttemptedPerGame: 19,
    fieldGoalPercentage: 52,
    threesMadePerGame: 2.1,
    threesAttemptedPerGame: 5.5,
    threePointPercentage: 38,
    freeThrowsMadePerGame: 5.4,
    freeThrowsAttemptedPerGame: 7.2,
    freeThrowPercentage: 75,
    trueShootingPercentage: 61.5,
    effectiveFieldGoalPercentage: 55.5,
    assistToTurnoverRatio: 2.65,
    plusMinusPerGame: 4.2,
    usagePercentage: 31.2,
    offensiveRating: 118.4,
    defensiveRating: 108.9,
    ...overrides,
  };
}

describe("PlayersListPage", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({ data: null, isPending: false } as never);
    vi.mocked(fetchPlayerStatsBatch).mockResolvedValue({ players: [] });
    vi.mocked(fetchPlayerStatsBatchInChunks).mockResolvedValue({ players: [] });
    vi.mocked(fetchPlayerLeaders).mockResolvedValue({
      seasonType: "REGULAR",
      minGames: 15,
      leaders: { ppg: null, rpg: null, apg: null, tsPct: null },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockSignedIn(me: MeProfile) {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: me.email, name: me.name } },
      isPending: false,
    } as never);
    vi.mocked(fetchMe).mockResolvedValue(me);
  }

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
    expect(screen.getByText("LAL")).toBeInTheDocument();
  });

  it("shows an em dash for a player with no team", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(fetchPlayers).mockResolvedValue(
      pagedPlayers([makePlayer({ id: "p2", lastName: "FreeAgent", team: null, teamId: null })])
    );

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("LeBron FreeAgent")).toBeInTheDocument();
    // Several cells can render an em dash (empty stats, unqualified leader
    // cards) — the team cell just has to be one of them.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
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
        // The leaderboard's default ranking goes to the API, which sorts
        // the whole filtered roster before slicing the page.
        sort: "ppg",
        // Leaderboards read most-first, so descending is the default.
        order: "desc",
      });
    });
  });

  it("sends the chosen direction along with the ranking", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
    const user = userEvent.setup();

    renderWithProviders(<PlayersListPage />);
    await screen.findByText("LeBron James");

    await user.selectOptions(screen.getByDisplayValue("Order: High to low"), "asc");

    await waitFor(() => {
      expect(fetchPlayers).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "ppg", order: "asc", page: 1 }));
    });
  });

  it("applies the chosen direction to the alphabetical default too", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
    const user = userEvent.setup();

    renderWithProviders(<PlayersListPage />);
    await screen.findByText("LeBron James");

    await user.selectOptions(screen.getByDisplayValue("Sort: Points per game"), "name");
    await user.selectOptions(screen.getByDisplayValue("Order: High to low"), "asc");

    await waitFor(() => {
      expect(fetchPlayers).toHaveBeenLastCalledWith(expect.objectContaining({ order: "asc", page: 1 }));
    });
    // The alphabetical default omits `sort` entirely rather than sending an
    // empty value — objectContaining can't assert an absent key.
    expect(vi.mocked(fetchPlayers).mock.calls.at(-1)?.[0]).not.toHaveProperty("sort");
  });

  it("shows a clear message when no players match", async () => {
    vi.mocked(fetchTeams).mockResolvedValue({ data: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([]));

    renderWithProviders(<PlayersListPage />);

    expect(await screen.findByText("No players found.")).toBeInTheDocument();
  });

  describe("league leaders band", () => {
    it("shows each category's leader with their figure, headshot, and team", async () => {
      const scorer = makePlayer({ id: "scorer-1", firstName: "Shai", lastName: "Gilgeous-Alexander" });
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      vi.mocked(fetchPlayerLeaders).mockResolvedValue({
        seasonType: "REGULAR",
        minGames: 15,
        leaders: {
          ppg: { player: scorer, value: 32.7, gamesPlayed: 62 },
          rpg: null,
          apg: null,
          tsPct: null,
        },
      });

      renderWithProviders(<PlayersListPage />);

      expect(await screen.findByText("League leaders")).toBeInTheDocument();
      // The leader cards and the floor label all arrive with the leaders
      // query — wait on the data itself, not the static section title.
      expect(await screen.findByText("Minimum 15 games")).toBeInTheDocument();
      expect(await screen.findByText("32.7")).toBeInTheDocument();
      expect(await screen.findByRole("link", { name: "Shai Gilgeous-Alexander" })).toBeInTheDocument();
      // The headshot sits in the block next to the name — decorative there
      // (empty alt), so it is identified by its CDN src within the band
      // rather than by an accessible name.
      const leadersSection = screen.getByRole("heading", { name: "League leaders" }).closest("section");
      expect(leadersSection?.querySelector('img[src*="cdn.nba.com/headshots"]')).not.toBeNull();
    });

    it("requests leaders for the selected segment so the band matches the table", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />, ["/players?segment=playoffs"]);

      await waitFor(() => expect(fetchPlayerLeaders).toHaveBeenCalledWith("PLAYOFFS"));
    });

    it("shows a loading panel while leaders are pending instead of the cards' empty face", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      // fetchPlayerLeaders deliberately left unmocked, so the query stays
      // pending — the band must not read "No qualified player" while the
      // request is still in flight.
      renderWithProviders(<PlayersListPage />);

      expect(await screen.findByRole("status", { name: "Loading league leaders" })).toBeInTheDocument();
      expect(screen.queryByText("No qualified player")).not.toBeInTheDocument();
    });

    it("shows a retryable error panel when the leaders request fails", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      vi.mocked(fetchPlayerLeaders).mockRejectedValue(new Error("leaders request failed"));

      renderWithProviders(<PlayersListPage />);

      expect(await screen.findByText("Could not load league leaders.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(fetchPlayerLeaders).toHaveBeenCalledTimes(2);
    });
  });

  describe("leaderboard table", () => {
    it("renders the rate columns and a per-player sparkline from the batch stats", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      vi.mocked(fetchPlayerStatsBatch).mockResolvedValue({
        players: [
          {
            playerId: "player-1",
            seasonAverages: makeSeasonAverages(),
            gameLog: Array.from({ length: 8 }, (_, index) => ({
              gameId: `game-${index}`,
              gameDate: `2026-01-0${index + 1}T00:00:00.000Z`,
              points: 20 + index,
              season: "2025-26",
            })),
          },
        ],
      });

      renderWithProviders(<PlayersListPage />);

      expect(await screen.findByText("27.1")).toBeInTheDocument();
      expect(screen.getByText("7.4")).toBeInTheDocument();
      expect(screen.getByText("8.2")).toBeInTheDocument();
      expect(screen.getByText("61.5%")).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: "LeBron James points across the last 8 games" })
      ).toBeInTheDocument();
      expect(fetchPlayerStatsBatch).toHaveBeenCalledWith(["player-1"], "REGULAR");
    });

    it("sends the min-games floor along with the ranking", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      const user = userEvent.setup();

      renderWithProviders(<PlayersListPage />);
      await screen.findByText("LeBron James");

      await user.selectOptions(screen.getByDisplayValue("Min. games: Any"), "15");

      await waitFor(() =>
        expect(fetchPlayers).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: "ppg", minGames: 15, page: 1 })
        )
      );
    });
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

  describe("following a player", () => {
    const ME_BASE: MeProfile = {
      id: "user-1",
      email: "player@example.com",
      name: "Player One",
      username: "playerone",
      avatarUrl: null,
      favoriteTeam: null,
      followedPlayers: [],
      role: "USER",
    };

    it("hides the Follow column for a signed-out visitor", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />);

      await screen.findByRole("link", { name: /LeBron James/ });
      expect(screen.queryByRole("button", { name: /follow lebron james/i })).not.toBeInTheDocument();
    });

    it("follows a player not yet followed", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      mockSignedIn(ME_BASE);
      vi.mocked(followPlayer).mockResolvedValue({ following: true });

      renderWithProviders(<PlayersListPage />);

      const followButton = await screen.findByRole("button", { name: /follow lebron james/i });
      await user.click(followButton);

      expect(followPlayer).toHaveBeenCalledWith("player-1");
    });

    it("unfollows an already-followed player", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      mockSignedIn({ ...ME_BASE, followedPlayers: [makePlayer()] });
      vi.mocked(unfollowPlayer).mockResolvedValue({ following: false });

      renderWithProviders(<PlayersListPage />);

      const unfollowButton = await screen.findByRole("button", { name: /unfollow lebron james/i });
      await user.click(unfollowButton);

      expect(unfollowPlayer).toHaveBeenCalledWith("player-1");
    });
  });

  describe("followed-only view", () => {
    const ME_BASE: MeProfile = {
      id: "user-1",
      email: "player@example.com",
      name: "Player One",
      username: "playerone",
      avatarUrl: null,
      favoriteTeam: null,
      followedPlayers: [],
      role: "USER",
    };

    it("hides the Following toggle for a signed-out visitor", async () => {
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));

      renderWithProviders(<PlayersListPage />);

      await screen.findByRole("link", { name: /LeBron James/ });
      expect(screen.queryByRole("button", { name: "Show followed players only" })).not.toBeInTheDocument();
    });

    it("narrows the table to the profile's followed players and stands the ranked query down", async () => {
      const user = userEvent.setup();
      const lebron = makePlayer();
      const shai = makePlayer({ id: "player-2", firstName: "Shai", lastName: "Gilgeous-Alexander" });
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([lebron, shai]));
      mockSignedIn({ ...ME_BASE, followedPlayers: [lebron] });

      renderWithProviders(<PlayersListPage />);
      expect(await screen.findByText("Shai Gilgeous-Alexander")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Show followed players only" }));

      // The followed view is built from the profile roster, so Shai drops
      // out even though the ranked page had him — and the ranked request
      // itself must not refire behind the toggle.
      expect(screen.queryByText("Shai Gilgeous-Alexander")).not.toBeInTheDocument();
      expect(screen.getByText("LeBron James")).toBeInTheDocument();
      expect(fetchPlayerStatsBatchInChunks).toHaveBeenCalledWith(["player-1"], "REGULAR");
      expect(fetchPlayers).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Your followed players")).toBeInTheDocument();
    });

    it("ranks the followed roster client-side by the selected stat", async () => {
      const user = userEvent.setup();
      const lebron = makePlayer();
      const shai = makePlayer({ id: "player-2", firstName: "Shai", lastName: "Gilgeous-Alexander" });
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([lebron, shai]));
      mockSignedIn({ ...ME_BASE, followedPlayers: [lebron, shai] });
      // The batch is keyed by player id, so each followed player gets the
      // figures the client-side ranking sorts on — Shai's higher PPG has
      // to win the default ranking even though LeBron's row was first
      // alphabetically.
      vi.mocked(fetchPlayerStatsBatchInChunks).mockResolvedValue({
        players: [
          { playerId: "player-1", seasonAverages: makeSeasonAverages({ pointsPerGame: 27.1 }), gameLog: [] },
          { playerId: "player-2", seasonAverages: makeSeasonAverages({ pointsPerGame: 32.7 }), gameLog: [] },
        ],
      });

      renderWithProviders(<PlayersListPage />);
      await screen.findByText("Shai Gilgeous-Alexander");

      await user.click(screen.getByRole("button", { name: "Show followed players only" }));

      const rows = within(screen.getByRole("table")).getAllByRole("row");
      // Row zero is the header — the first body row should now be Shai's.
      expect(rows[1]).toHaveTextContent("Shai Gilgeous-Alexander");
      expect(rows[2]).toHaveTextContent("LeBron James");
    });

    it("tells a signed-in visitor following nobody how to build the list", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([makePlayer()]));
      mockSignedIn(ME_BASE);

      renderWithProviders(<PlayersListPage />);
      await screen.findByText("LeBron James");

      await user.click(screen.getByRole("button", { name: "Show followed players only" }));

      expect(await screen.findByText(/not following any players yet/)).toBeInTheDocument();
    });

    it("restores the full ranked list when the toggle is switched off", async () => {
      const user = userEvent.setup();
      const lebron = makePlayer();
      const shai = makePlayer({ id: "player-2", firstName: "Shai", lastName: "Gilgeous-Alexander" });
      vi.mocked(fetchTeams).mockResolvedValue({ data: [LAKERS], page: 1, pageSize: 100, total: 1 });
      vi.mocked(fetchPlayers).mockResolvedValue(pagedPlayers([lebron, shai]));
      mockSignedIn({ ...ME_BASE, followedPlayers: [lebron] });

      renderWithProviders(<PlayersListPage />);
      await screen.findByText("Shai Gilgeous-Alexander");

      const toggle = screen.getByRole("button", { name: "Show followed players only" });
      await user.click(toggle);
      expect(screen.queryByText("Shai Gilgeous-Alexander")).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-pressed", "true");

      await user.click(toggle);

      expect(await screen.findByText("Shai Gilgeous-Alexander")).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
  });
});
