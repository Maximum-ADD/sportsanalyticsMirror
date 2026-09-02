import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparePage } from "./ComparePage";
import { renderWithProviders } from "@/test/renderWithProviders";
import { fetchPlayer, fetchPlayerComparison, fetchPlayers, fetchPlayerStats } from "@/lib/nbaApi";
import type { Player, SeasonAverages } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchPlayer: vi.fn(),
  fetchPlayerComparison: vi.fn(),
  fetchPlayers: vi.fn(),
  fetchPlayerStats: vi.fn(),
}));

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
    teamId: "team-1",
    team: {
      id: "team-1",
      nbaTeamId: 1,
      name: "Lakers",
      abbreviation: "LAL",
      city: "Los Angeles",
      conference: "West",
      division: "Pacific",
      logoUrl: null,
    },
    // Bio fields default to null — the compare page doesn't render any of
    // them, but Player requires them, so a test that cares about one
    // (e.g. draft details) passes it through `overrides` instead.
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

function makeAverages(overrides: Partial<SeasonAverages> = {}): SeasonAverages {
  return {
    gamesPlayed: 10,
    minutesPerGame: 34,
    pointsPerGame: 25,
    reboundsPerGame: 7,
    assistsPerGame: 8,
    stealsPerGame: 1,
    blocksPerGame: 1,
    turnoversPerGame: 3,
    fieldGoalsMadePerGame: 9,
    fieldGoalsAttemptedPerGame: 18,
    fieldGoalPercentage: 50,
    threesMadePerGame: 2,
    threesAttemptedPerGame: 6,
    threePointPercentage: 33,
    freeThrowsMadePerGame: 5,
    freeThrowsAttemptedPerGame: 6,
    freeThrowPercentage: 83,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchPlayers).mockResolvedValue({ data: [], page: 1, pageSize: 6, total: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ComparePage", () => {
  it("shows two empty player slots when nothing is selected", () => {
    renderWithProviders(<ComparePage />, ["/compare"]);

    expect(screen.getByRole("searchbox", { name: "Select player 1" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Select player 2" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "General" })).not.toBeInTheDocument();
  });

  it("keeps an empty slot beside the player already picked", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue({
      playerId: "player-1",
      seasonAverages: makeAverages(),
      gameLog: [],
    });

    renderWithProviders(<ComparePage />, ["/compare?ids=player-1"]);

    expect(await screen.findByText("LeBron James")).toBeInTheDocument();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getByRole("searchbox", { name: "Select player 2" })).toBeInTheDocument();
    expect(fetchPlayerComparison).not.toHaveBeenCalled();
  });

  it("adds a further empty slot when Add another player is clicked, and cancels it again", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComparePage />, ["/compare"]);

    // The two slots a comparison always shows can't be cancelled away — only
    // the third, which the user opened themselves.
    expect(screen.queryByRole("button", { name: /Cancel adding player/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Add another player/ }));
    expect(screen.getAllByRole("searchbox")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Cancel adding player 3" }));
    expect(screen.getAllByRole("searchbox")).toHaveLength(2);
  });

  it("spells positions out on the tile and keeps them out of the General rows", async () => {
    vi.mocked(fetchPlayerComparison).mockResolvedValue({
      players: [
        { player: makePlayer({ id: "player-1", position: "G-F" }), seasonAverages: makeAverages() },
        {
          player: makePlayer({
            id: "player-2",
            firstName: "Stephen",
            lastName: "Curry",
            nbaPlayerId: 2,
            position: "C",
          }),
          seasonAverages: makeAverages(),
        },
      ],
    });

    renderWithProviders(<ComparePage />, ["/compare?ids=player-1,player-2"]);

    expect(await screen.findByText("Guard-Forward")).toBeInTheDocument();
    expect(screen.getByText("Center")).toBeInTheDocument();
    // Team moves into General; position stays on the tile only.
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.queryByText("Position")).not.toBeInTheDocument();
  });

  it("fills an unclaimed slot's rows with a dash rather than leaving them blank", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayerComparison).mockResolvedValue({
      players: [
        { player: makePlayer({ id: "player-1" }), seasonAverages: makeAverages() },
        {
          player: makePlayer({ id: "player-2", firstName: "Stephen", lastName: "Curry", nbaPlayerId: 2 }),
          seasonAverages: makeAverages(),
        },
      ],
    });

    renderWithProviders(<ComparePage />, ["/compare?ids=player-1,player-2"]);
    await screen.findByText("LeBron James");

    // Age has no source on this branch, so both real players already show a
    // dash there and nowhere else.
    const dashesWithNoEmptySlot = screen.getAllByText("—");
    expect(dashesWithNoEmptySlot).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Add another player/ }));

    // The third column now carries a dash on every stat row.
    expect(screen.getAllByText("—").length).toBeGreaterThan(dashesWithNoEmptySlot.length);
  });

  it("renders a tile and grouped stat rows for each compared player, highlighting the leader", async () => {
    vi.mocked(fetchPlayerComparison).mockResolvedValue({
      players: [
        { player: makePlayer({ id: "player-1", lastName: "James" }), seasonAverages: makeAverages({ pointsPerGame: 30 }) },
        {
          player: makePlayer({ id: "player-2", firstName: "Stephen", lastName: "Curry", nbaPlayerId: 2 }),
          seasonAverages: makeAverages({ pointsPerGame: 22 }),
        },
      ],
    });

    renderWithProviders(<ComparePage />, ["/compare?ids=player-1,player-2"]);

    expect(await screen.findByText("LeBron James")).toBeInTheDocument();
    expect(screen.getByText("Stephen Curry")).toBeInTheDocument();

    // Group headings carry the "(per game)" qualifier so the row names stay short.
    expect(screen.getByRole("heading", { name: "Points (per game)" })).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();

    expect(screen.getByText("30")).toHaveClass("text-brand-accent");
    expect(screen.getByText("22")).not.toHaveClass("text-brand-accent");
  });

  it("renders shooting rows as made / attempted (accuracy) in a single cell", async () => {
    vi.mocked(fetchPlayerComparison).mockResolvedValue({
      players: [
        { player: makePlayer({ id: "player-1" }), seasonAverages: makeAverages() },
        {
          player: makePlayer({ id: "player-2", firstName: "Stephen", lastName: "Curry", nbaPlayerId: 2 }),
          seasonAverages: makeAverages({ freeThrowsMadePerGame: 2, freeThrowPercentage: 90 }),
        },
      ],
    });

    renderWithProviders(<ComparePage />, ["/compare?ids=player-1,player-2"]);

    expect(await screen.findByText("5 / 6 (83%)")).toBeInTheDocument();
    expect(screen.getByText("2 / 6 (90%)")).toBeInTheDocument();
    // Leader is the higher volume of makes, not the better percentage.
    expect(screen.getByText("5 / 6 (83%)")).toHaveClass("text-brand-accent");
  });

  it("adds a player picked from the search results to the comparison", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayers).mockResolvedValue({
      data: [makePlayer({ id: "player-9", firstName: "Nikola", lastName: "Jokic", nbaPlayerId: 9, team: null })],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    vi.mocked(fetchPlayer).mockResolvedValue(
      makePlayer({ id: "player-9", firstName: "Nikola", lastName: "Jokic", nbaPlayerId: 9, team: null })
    );
    vi.mocked(fetchPlayerStats).mockResolvedValue({
      playerId: "player-9",
      seasonAverages: makeAverages(),
      gameLog: [],
    });

    renderWithProviders(<ComparePage />, ["/compare"]);

    await user.type(screen.getByRole("searchbox", { name: "Select player 1" }), "jok");
    await user.click(await screen.findByRole("button", { name: /Nikola Jokic/ }));

    expect(await screen.findByText("Nikola Jokic")).toBeInTheDocument();
    await waitFor(() => expect(fetchPlayerStats).toHaveBeenCalledWith("player-9"));
  });
});
