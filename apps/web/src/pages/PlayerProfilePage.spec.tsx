import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerProfilePage } from "./PlayerProfilePage";
import { fetchPlayer, fetchPlayerStats, fetchPlayerStatsSplits } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { PlayerSeasonSplits, Player, PlayerStatsResponse, SeasonAverages, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchPlayer: vi.fn(),
  fetchPlayerStats: vi.fn(),
  fetchPlayerStatsSplits: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ playerId: "player-1" }) };
});

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
    nbaPlayerId: 2544,
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

const STATS: PlayerStatsResponse = {
  playerId: "player-1",
  seasonAverages: {
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
  },
  seasonType: "REGULAR" as const,
  gameLog: [{ gameId: "game-1", gameDate: "2026-01-01T00:00:00.000Z", points: 30 }],
};

describe("PlayerProfilePage bio section", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows real draft details for a player whose bio has been ingested", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(
      makePlayer({
        birthDate: "1984-12-30",
        draftYear: 2003,
        draftRound: 1,
        draftNumber: 1,
      }),
    );
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);

    renderWithProviders(<PlayerProfilePage />);

    expect(await screen.findByText("2003 · Round 1 · Pick 1")).toBeInTheDocument();
  });

  it("labels a genuinely undrafted player as Undrafted once their bio is loaded", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer({ birthDate: "1990-01-01" }));
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);

    renderWithProviders(<PlayerProfilePage />);

    expect(await screen.findByText("Undrafted")).toBeInTheDocument();
  });

  it("shows a loading placeholder, not 'Undrafted', when the bio has not been ingested yet", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer({ birthDate: null }));
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);

    renderWithProviders(<PlayerProfilePage />);

    expect(await screen.findAllByText("Loading…")).not.toHaveLength(0);
    expect(screen.queryByText("Undrafted")).not.toBeInTheDocument();
  });
});

describe("PlayerProfilePage local stat editing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lets a visitor edit a stat locally, see it reflected, then reset back to the real value", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer({ birthDate: "1990-01-01" }));
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);

    renderWithProviders(<PlayerProfilePage />);
    await screen.findByText("Undrafted");

    await user.click(screen.getByRole("button", { name: "Edit stats" }));
    const ppgInput = screen.getByRole("spinbutton", { name: "Edit PPG" });
    await user.clear(ppgInput);
    await user.type(ppgInput, "99");
    expect(ppgInput).toHaveValue(99);

    await user.click(screen.getByRole("button", { name: "Done editing" }));
    expect(screen.getByText("99")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("27.1")).toBeInTheDocument();
  });
});

// Zeroed line for a segment the player didn't appear in — what the splits
// endpoint returns for an absent segment (gamesPlayed: 0), not a missing key.
function makeEmptyAverages(): SeasonAverages {
  return {
    gamesPlayed: 0,
    minutesPerGame: 0,
    pointsPerGame: 0,
    reboundsPerGame: 0,
    assistsPerGame: 0,
    stealsPerGame: 0,
    blocksPerGame: 0,
    turnoversPerGame: 0,
    fieldGoalsMadePerGame: 0,
    fieldGoalsAttemptedPerGame: 0,
    fieldGoalPercentage: 0,
    threesMadePerGame: 0,
    threesAttemptedPerGame: 0,
    threePointPercentage: 0,
    freeThrowsMadePerGame: 0,
    freeThrowsAttemptedPerGame: 0,
    freeThrowPercentage: 0,
  };
}

function makeSplits(overrides: Partial<PlayerSeasonSplits> = {}): PlayerSeasonSplits {
  return {
    REGULAR: STATS.seasonAverages,
    PLAY_IN: makeEmptyAverages(),
    PLAYOFFS: makeEmptyAverages(),
    FINALS: makeEmptyAverages(),
    ...overrides,
  };
}

describe("PlayerProfilePage season segments", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requests the regular season by default", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);

    expect(await screen.findByText(/Showing regular season figures only/)).toBeInTheDocument();
    expect(fetchPlayerStats).toHaveBeenCalledWith("player-1", "REGULAR");
  });

  it("reads the selected segment from the URL so a postseason view is shareable", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue({ ...STATS, seasonType: "FINALS" });
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />, ["/players/player-1?segment=finals"]);

    await screen.findByText(/Showing finals figures only/);
    expect(fetchPlayerStats).toHaveBeenCalledWith("player-1", "FINALS");
  });

  it("refetches for the newly selected segment rather than reusing the current one", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);
    await screen.findByRole("radio", { name: "Playoffs" });

    await user.click(screen.getByRole("radio", { name: "Playoffs" }));

    expect(fetchPlayerStats).toHaveBeenCalledWith("player-1", "PLAYOFFS");
  });

  it("says the player was absent rather than presenting zeros as a bad performance", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue({
      ...STATS,
      seasonType: "PLAY_IN",
      seasonAverages: makeEmptyAverages(),
      gameLog: [],
    });
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />, ["/players/player-1?segment=play-in"]);

    expect(await screen.findByText(/did not play in the Play-In this season/)).toBeInTheDocument();
  });

  it("clears local stat edits when the segment changes, so an edited regular-season figure can't appear in a postseason view", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);
    await screen.findByRole("button", { name: "Edit stats" });

    await user.click(screen.getByRole("button", { name: "Edit stats" }));
    const ppgInput = screen.getByRole("spinbutton", { name: "Edit PPG" });
    await user.clear(ppgInput);
    await user.type(ppgInput, "99");
    await user.click(screen.getByRole("button", { name: "Done editing" }));
    expect(screen.getByText("99")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Playoffs" }));

    expect(screen.queryByText("99")).not.toBeInTheDocument();
  });

  it("carries the selected segment into the Compare link", async () => {
    // Reported in review: comparing from a Finals view opened a
    // regular-season comparison. The compare page reads ?segment, so the
    // link that navigates to it has to set one.
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue({ ...STATS, seasonType: "FINALS" });
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />, ["/players/player-1?segment=finals"]);

    const compareLink = await screen.findByRole("link", { name: "Compare" });
    expect(compareLink).toHaveAttribute("href", expect.stringContaining("segment=finals"));
    expect(compareLink).toHaveAttribute("href", expect.stringContaining("ids=player-1"));
  });

  it("updates the Compare link when the segment changes", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);
    await screen.findByRole("radio", { name: "Playoffs" });
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      expect.stringContaining("segment=regular")
    );

    await user.click(screen.getByRole("radio", { name: "Playoffs" }));

    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      expect.stringContaining("segment=playoffs")
    );
  });
});
