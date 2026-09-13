import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerProfilePage } from "./PlayerProfilePage";
import { fetchPlayer, fetchPlayerMatchupProjection, fetchPlayerStats, fetchPlayerStatsSplits } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type {
  PlayerSeasonSplits,
  Player,
  PlayerMatchupProjection,
  PlayerStatsResponse,
  SeasonAverages,
  Team,
} from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchPlayer: vi.fn(),
  fetchPlayerStats: vi.fn(),
  fetchPlayerStatsSplits: vi.fn(),
  fetchPlayerMatchupProjection: vi.fn(),
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
    trueShootingPercentage: 0,
    effectiveFieldGoalPercentage: 0,
    assistToTurnoverRatio: null,
    plusMinusPerGame: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
  },
  seasonType: "REGULAR" as const,
  gameLog: [{ gameId: "game-1", gameDate: "2026-01-01T00:00:00.000Z", points: 30, season: "2025-26" }],
};

// The matchup panel's quiet default: nothing on the schedule and no
// opponent history. Tests that care override it; the empty upcoming list
// keeps the projected chip on its flat-line fallback label.
const EMPTY_MATCHUP_PROJECTION: PlayerMatchupProjection = {
  playerId: "player-1",
  seasonType: "REGULAR",
  overallPointsPerGame: 27.1,
  splits: [],
  upcomingGames: [],
};

beforeEach(() => {
  vi.mocked(fetchPlayerMatchupProjection).mockResolvedValue(EMPTY_MATCHUP_PROJECTION);
});

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
    // "27.1" appears twice once the traits panel is in play — the PPG tile
    // and the panel's PTS/G line both carry it — so presence is asserted
    // against the set, not a unique match.
    expect(screen.getAllByText("27.1").length).toBeGreaterThan(0);
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
    trueShootingPercentage: 0,
    effectiveFieldGoalPercentage: 0,
    assistToTurnoverRatio: null,
    plusMinusPerGame: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
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

describe("PlayerProfilePage navigation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Back button above the profile", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);

    renderWithProviders(<PlayerProfilePage />);

    // The accessible name carries the arrow glyph ("← Back"), so the match
    // is a substring regex rather than the exact string.
    expect(await screen.findByRole("button", { name: /Back/ })).toBeInTheDocument();
  });

  it("keeps the page rendered while the new segment loads, instead of dropping to the full-page spinner", async () => {
    const user = userEvent.setup();
    // The playoffs fetch stays pending until the test releases it, holding
    // the page in the between-segments state on purpose.
    let resolvePlayoffs: ((stats: PlayerStatsResponse) => void) | undefined;
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockImplementation((_playerId, seasonType) =>
      seasonType === "PLAYOFFS"
        ? new Promise<PlayerStatsResponse>((resolve) => {
            resolvePlayoffs = resolve;
          })
        : Promise.resolve(STATS)
    );

    renderWithProviders(<PlayerProfilePage />);
    await screen.findByRole("heading", { level: 1, name: "LeBron James" });

    await user.click(screen.getByRole("radio", { name: "Playoffs" }));

    // The previous segment's profile stays on screen — no full-page reload.
    expect(screen.queryByRole("status", { name: "Loading player" })).not.toBeInTheDocument();
    // SectionLoading blurs the stale sections in place and marks them
    // aria-hidden (the overlay announces the switch to screen readers), so
    // the heading survives only as a hidden role.
    expect(screen.getByRole("heading", { level: 1, name: "LeBron James", hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "Loading player stats" }).length).toBeGreaterThan(0);

    resolvePlayoffs!({ ...STATS, seasonType: "PLAYOFFS" });

    expect(await screen.findByText(/Showing playoffs figures only/)).toBeInTheDocument();
  });
});

describe("PlayerProfilePage points trend season filter", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // A log spanning two league years — what the API returns for a segment
  // the player has played in across seasons.
  const MULTI_SEASON_STATS: PlayerStatsResponse = {
    ...STATS,
    gameLog: [
      { gameId: "g-1", gameDate: "2024-11-01T00:00:00.000Z", points: 20, season: "2024-25" },
      { gameId: "g-2", gameDate: "2025-11-01T00:00:00.000Z", points: 30, season: "2025-26" },
      { gameId: "g-3", gameDate: "2025-11-03T00:00:00.000Z", points: 40, season: "2025-26" },
    ],
  };

  it("charts the most recent season by default and switches seasons on chip click", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(MULTI_SEASON_STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);
    await screen.findByRole("button", { name: "Edit stats" });

    const chipGroup = screen.getByRole("group", { name: "Season to chart" });
    const chips = within(chipGroup).getAllByRole("button");
    // Most recent season first, then the earlier year, then the upcoming
    // season's projection (a full schedule at the current scoring rate).
    expect(chips.map((chip) => chip.textContent)).toEqual(["2025-26", "2024-25", "2026-27 · projected"]);

    // Latest season is the default chart scope: its two games, not the
    // three games the whole log holds.
    expect(within(chipGroup).getByRole("button", { name: "2025-26" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 games charted")).toBeInTheDocument();

    await user.click(within(chipGroup).getByRole("button", { name: "2024-25" }));

    expect(within(chipGroup).getByRole("button", { name: "2024-25" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chipGroup).getByRole("button", { name: "2025-26" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1 game charted")).toBeInTheDocument();
  });

  it("charts a projected upcoming season at the current scoring rate", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(MULTI_SEASON_STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);
    const chipGroup = await screen.findByRole("group", { name: "Season to chart" });

    await user.click(within(chipGroup).getByRole("button", { name: "2026-27 · projected" }));

    expect(within(chipGroup).getByRole("button", { name: "2026-27 · projected" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // The projection carries the current line's 27.1 PPG across a full
    // 82-game schedule instead of charting any played games.
    expect(screen.getByText("Projected at 27.1 PPG · 82-game schedule")).toBeInTheDocument();

    await user.click(within(chipGroup).getByRole("button", { name: "2025-26" }));

    expect(within(chipGroup).getByRole("button", { name: "2026-27 · projected" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByText("2 games charted")).toBeInTheDocument();
  });

  it("offers no projection in a postseason segment, where a full-season forecast means nothing", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(MULTI_SEASON_STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />, ["/players/player-1?segment=playoffs"]);

    const chipGroup = await screen.findByRole("group", { name: "Season to chart" });
    expect(within(chipGroup).queryByRole("button", { name: /projected/ })).not.toBeInTheDocument();
  });

  it("resets the charted season when the segment changes", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(MULTI_SEASON_STATS);
    vi.mocked(fetchPlayerStatsSplits).mockResolvedValue({ playerId: "player-1", splits: makeSplits() });

    renderWithProviders(<PlayerProfilePage />);
    const chipGroup = await screen.findByRole("group", { name: "Season to chart" });
    await user.click(within(chipGroup).getByRole("button", { name: "2024-25" }));

    await user.click(screen.getByRole("radio", { name: "Playoffs" }));

    // Switching segments keeps the previous figures on screen (the query's
    // placeholder) while the new segment fetches, so the chip group never
    // unmounts — the assertion re-queries it fresh anyway. Back to the
    // default: the new segment's own most recent season.
    await waitFor(() =>
      expect(
        within(screen.getByRole("group", { name: "Season to chart" })).getByRole("button", { name: "2025-26" })
      ).toHaveAttribute("aria-pressed", "true")
    );
  });
});

describe("PlayerProfilePage matchup analysis", () => {
  // Two unplayed games (hosting Boston, then visiting never-faced Miami)
  // over a 28.0 PPG history: 36.0 vs BOS, 20.0 vs NYK. Boston's projection
  // is 28 + (36 - 28) * 8/(8+8) = 32.0; Miami falls back to the overall rate.
  const MATCHUP_PROJECTION: PlayerMatchupProjection = {
    playerId: "player-1",
    seasonType: "REGULAR",
    overallPointsPerGame: 28,
    splits: [
      { opponent: { id: "bos", name: "Celtics", abbreviation: "BOS" }, gamesPlayed: 8, pointsPerGame: 36 },
      { opponent: { id: "nyk", name: "Knicks", abbreviation: "NYK" }, gamesPlayed: 8, pointsPerGame: 20 },
    ],
    upcomingGames: [
      {
        gameId: "g-future-1",
        gameDate: "2099-01-01T00:00:00.000Z",
        opponent: { id: "bos", name: "Celtics", abbreviation: "BOS" },
        isHome: true,
        projectedPoints: 32,
      },
      {
        gameId: "g-future-2",
        gameDate: "2099-01-03T00:00:00.000Z",
        opponent: { id: "mia", name: "Heat", abbreviation: "MIA" },
        isHome: false,
        projectedPoints: 28,
      },
    ],
  };

  it("shows the next game's opponent-adjusted projection and per-opponent scoring", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);
    vi.mocked(fetchPlayerMatchupProjection).mockResolvedValue(MATCHUP_PROJECTION);

    renderWithProviders(<PlayerProfilePage />);

    expect(await screen.findByText("vs Celtics")).toBeInTheDocument();
    expect(screen.getByText("32.0")).toBeInTheDocument();
    expect(screen.getByText("36.0 PPG vs BOS over 8 games · 28.0 overall")).toBeInTheDocument();

    // Per-opponent bars, best matchup first, each labelled for assistive tech.
    const bars = screen.getAllByRole("listitem");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute(
      "aria-label",
      "36.0 points per game against BOS across 8 games"
    );
    expect(bars[1]).toHaveAttribute(
      "aria-label",
      "20.0 points per game against NYK across 8 games"
    );
  });

  it("says so when the player's team has nothing left on the schedule", async () => {
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);

    renderWithProviders(<PlayerProfilePage />);

    expect(
      await screen.findByText("No upcoming games on the schedule for this player's team.")
    ).toBeInTheDocument();
  });

  it("charts the upcoming schedule game-by-game when the projection chip is on", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPlayer).mockResolvedValue(makePlayer());
    vi.mocked(fetchPlayerStats).mockResolvedValue(STATS);
    vi.mocked(fetchPlayerMatchupProjection).mockResolvedValue(MATCHUP_PROJECTION);

    renderWithProviders(<PlayerProfilePage />);
    const chipGroup = await screen.findByRole("group", { name: "Season to chart" });
    await user.click(within(chipGroup).getByRole("button", { name: "2026-27 · projected" }));

    expect(screen.getByText("Opponent-adjusted · 2-game schedule")).toBeInTheDocument();

    // Back on a played season the label reverts to the charted-game count.
    await user.click(within(chipGroup).getByRole("button", { name: "2025-26" }));
    expect(screen.getByText("1 game charted")).toBeInTheDocument();
  });
});
