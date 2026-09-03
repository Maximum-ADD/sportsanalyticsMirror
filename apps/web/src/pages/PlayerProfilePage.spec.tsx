import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerProfilePage } from "./PlayerProfilePage";
import { fetchPlayer, fetchPlayerStats } from "@/lib/nbaApi";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Player, PlayerStatsResponse, Team } from "@/types/nba";

vi.mock("@/lib/nbaApi", () => ({
  fetchPlayer: vi.fn(),
  fetchPlayerStats: vi.fn(),
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
