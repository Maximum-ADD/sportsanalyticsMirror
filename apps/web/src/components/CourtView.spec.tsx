import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourtView } from "./CourtView";
import type { PredictedScorer, Team } from "@/types/nba";

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

function makeScorer(overrides: Partial<PredictedScorer["player"]> = {}, predictedPoints = 20): PredictedScorer {
  return {
    player: {
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
    },
    predictedPoints,
    gamesConsidered: 8,
  };
}

describe("CourtView", () => {
  it("renders a labelled SVG court with each scorer's last name and predicted points", () => {
    const homeScorers = [makeScorer({}, 27.4)];
    const awayScorers = [makeScorer({ id: "player-2", lastName: "Tatum", teamId: CELTICS.id, team: CELTICS }, 24.1)];

    render(<CourtView homeTeam={LAKERS} awayTeam={CELTICS} homeScorers={homeScorers} awayScorers={awayScorers} />);

    expect(screen.getByRole("img", { name: /Lakers and Celtics/ })).toBeInTheDocument();
    expect(screen.getByText("James")).toBeInTheDocument();
    expect(screen.getByText("27.4 pts")).toBeInTheDocument();
    expect(screen.getByText("Tatum")).toBeInTheDocument();
    expect(screen.getByText("24.1 pts")).toBeInTheDocument();
  });

  it("renders with no scorers on either side without crashing", () => {
    render(<CourtView homeTeam={LAKERS} awayTeam={CELTICS} homeScorers={[]} awayScorers={[]} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
