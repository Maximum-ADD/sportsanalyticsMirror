import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComparisonTraitsRadar } from "./ComparisonTraitsRadar";
import type { Player, PlayerComparisonEntry, SeasonAverages, Team } from "@/types/nba";

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
    trueShootingPercentage: 60,
    effectiveFieldGoalPercentage: 55,
    assistToTurnoverRatio: 2.5,
    plusMinusPerGame: 4.2,
    usagePercentage: 29.4,
    offensiveRating: 118,
    defensiveRating: 110,
    ...overrides,
  };
}

function makeEntry(playerId: string, firstName: string, lastName: string): PlayerComparisonEntry {
  return {
    player: makePlayer({ id: playerId, firstName, lastName }),
    seasonAverages: makeAverages(),
  };
}

describe("ComparisonTraitsRadar screen-reader summary", () => {
  it("carries each player's normalised traits as text in the overlay layout", () => {
    render(
      <ComparisonTraitsRadar
        entries={[makeEntry("player-1", "LeBron", "James"), makeEntry("player-2", "Stephen", "Curry")]}
      />
    );

    // 25 PTS on a 35 ceiling ≈ 71; 7 REB on 15 ≈ 47; 8 AST on 12 ≈ 67;
    // 1 STL + 1 BLK on 4 ≈ 50; 50 FG% on 65 ≈ 77.
    expect(screen.getByText("LeBron James: Scoring 71, Rebounding 47, Playmaking 67, Defense 50, Efficiency 77")).toBeInTheDocument();
    expect(screen.getByText(/Stephen Curry: Scoring 71/)).toBeInTheDocument();
  });

  it("summarises every player in the small-multiples layout", () => {
    render(
      <ComparisonTraitsRadar
        entries={[
          makeEntry("player-1", "LeBron", "James"),
          makeEntry("player-2", "Stephen", "Curry"),
          makeEntry("player-3", "Nikola", "Jokic"),
        ]}
      />
    );

    const summary = screen.getByText(/LeBron James: Scoring 71/).closest("ul")!;
    expect(summary.children).toHaveLength(3);
  });
});
