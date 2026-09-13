import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ComparisonTraitsRadar } from "./ComparisonTraitsRadar";
import type { Player, PlayerComparisonEntry, SeasonAverages } from "@/types/nba";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const RealResponsiveContainer = actual.ResponsiveContainer;
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <RealResponsiveContainer width={480} height={240}>
        {children}
      </RealResponsiveContainer>
    ),
  };
});

function makeAverages(overrides: Partial<SeasonAverages> = {}): SeasonAverages {
  return {
    gamesPlayed: 62,
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
    effectiveFieldGoalPercentage: 55.9,
    assistToTurnoverRatio: 2.65,
    plusMinusPerGame: 6.4,
    usagePercentage: 31.2,
    offensiveRating: 118,
    defensiveRating: 109,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1,
    firstName: "Shai",
    lastName: "Gilgeous-Alexander",
    position: "G",
    heightInches: 78,
    weightLbs: 195,
    jerseyNumber: "2",
    headshotUrl: null,
    teamId: null,
    team: null,
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

function makeEntry(overrides: Partial<PlayerComparisonEntry> = {}): PlayerComparisonEntry {
  return { player: makePlayer(), seasonAverages: makeAverages(), ...overrides };
}

describe("ComparisonTraitsRadar", () => {
  it("renders nothing for zero entries", () => {
    const { container } = render(<ComparisonTraitsRadar entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("overlays two players on one chart with a legend naming both", () => {
    const shai = makeEntry();
    const jokic = makeEntry({
      player: makePlayer({ id: "player-2", firstName: "Nikola", lastName: "Jokić" }),
    });

    render(<ComparisonTraitsRadar entries={[shai, jokic]} />);

    expect(screen.getAllByText("Shai Gilgeous-Alexander").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nikola Jokić").length).toBeGreaterThan(0);
    // Every trait axis is present exactly once — one shared chart, not one
    // per player.
    for (const traitName of ["Scoring", "Rebounding", "Playmaking", "Defense", "Efficiency"]) {
      expect(screen.getAllByText(traitName)).toHaveLength(1);
    }
  });

  it("falls back to one small chart per player for three or more players, each with visible trait labels", () => {
    const entries = [
      makeEntry({ player: makePlayer({ id: "p1", firstName: "A" }) }),
      makeEntry({ player: makePlayer({ id: "p2", firstName: "B" }) }),
      makeEntry({ player: makePlayer({ id: "p3", firstName: "C" }) }),
    ];

    render(<ComparisonTraitsRadar entries={entries} />);

    for (const name of ["A Gilgeous-Alexander", "B Gilgeous-Alexander", "C Gilgeous-Alexander"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    // Each of the three small multiples renders its own axis labels now
    // (previously tick={false} left them blank) — three occurrences of the
    // trait's abbreviated label, one per chart.
    expect(screen.getAllByText("Sco")).toHaveLength(3);
  });

  it("defaults the drill-down panel to Scoring and shows every player's figure", () => {
    const shai = makeEntry({ seasonAverages: makeAverages({ pointsPerGame: 30.5 }) });
    const jokic = makeEntry({
      player: makePlayer({ id: "player-2", firstName: "Nikola", lastName: "Jokić" }),
      seasonAverages: makeAverages({ pointsPerGame: 25.3 }),
    });

    render(<ComparisonTraitsRadar entries={[shai, jokic]} />);

    expect(screen.getByText("Scoring · this segment")).toBeInTheDocument();
    expect(screen.getByText("30.5")).toBeInTheDocument();
    expect(screen.getByText("25.3")).toBeInTheDocument();
  });

  it("switches the drill-down panel to the clicked trait for every player", async () => {
    const user = userEvent.setup();
    const shai = makeEntry({ seasonAverages: makeAverages({ fieldGoalPercentage: 55 }) });
    const jokic = makeEntry({
      player: makePlayer({ id: "player-2", firstName: "Nikola", lastName: "Jokić" }),
      seasonAverages: makeAverages({ fieldGoalPercentage: 58 }),
    });

    render(<ComparisonTraitsRadar entries={[shai, jokic]} />);

    await user.click(screen.getByRole("button", { name: "Efficiency" }));

    expect(screen.getByText("Efficiency · this segment")).toBeInTheDocument();
    expect(screen.getByText("55.0%")).toBeInTheDocument();
    expect(screen.getByText("58.0%")).toBeInTheDocument();
  });
});
