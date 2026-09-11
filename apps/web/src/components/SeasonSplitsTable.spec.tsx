import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeasonSplitsTable } from "./SeasonSplitsTable";
import type { PlayerSeasonSplits, SeasonAverages } from "@/types/nba";

function makeAverages(overrides: Partial<SeasonAverages> = {}): SeasonAverages {
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
    ...overrides,
  };
}

function makeSplits(overrides: Partial<PlayerSeasonSplits> = {}): PlayerSeasonSplits {
  return {
    REGULAR: makeAverages(),
    PLAY_IN: makeAverages(),
    PLAYOFFS: makeAverages(),
    FINALS: makeAverages(),
    ...overrides,
  };
}

describe("SeasonSplitsTable", () => {
  it("says so plainly when the player has no postseason games at all", () => {
    const splits = makeSplits({ REGULAR: makeAverages({ gamesPlayed: 70, pointsPerGame: 25 }) });

    render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

    expect(screen.getByText(/LeBron James has no postseason games in this season/)).toBeInTheDocument();
  });

  it("omits segments the player didn't appear in rather than showing them as zeros", () => {
    // A column of 0.0s reads as "played badly", not "wasn't there" — the
    // distinction this assertion protects.
    const splits = makeSplits({
      REGULAR: makeAverages({ gamesPlayed: 70, pointsPerGame: 25 }),
      PLAYOFFS: makeAverages({ gamesPlayed: 12, pointsPerGame: 29 }),
    });

    render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

    expect(screen.getByRole("columnheader", { name: /Playoffs/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Finals/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Play-In/ })).not.toBeInTheDocument();
  });

  it("shows the change from the regular season with an explicit sign", () => {
    const splits = makeSplits({
      REGULAR: makeAverages({ gamesPlayed: 70, pointsPerGame: 25 }),
      PLAYOFFS: makeAverages({ gamesPlayed: 12, pointsPerGame: 29.2 }),
    });

    render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

    // The sign carries the direction, not just the colour, so the table
    // still reads correctly without colour vision.
    expect(screen.getByText("+4.2")).toBeInTheDocument();
  });

  it("shows a drop with a minus sign", () => {
    const splits = makeSplits({
      REGULAR: makeAverages({ gamesPlayed: 70, threePointPercentage: 38 }),
      FINALS: makeAverages({ gamesPlayed: 6, threePointPercentage: 32 }),
    });

    render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

    expect(screen.getByText("−6.0%")).toBeInTheDocument();
  });

  it("reports games played per segment, so a rate is read next to its sample size", () => {
    const splits = makeSplits({
      REGULAR: makeAverages({ gamesPlayed: 70 }),
      FINALS: makeAverages({ gamesPlayed: 1 }),
    });

    render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

    expect(screen.getByText("70 games")).toBeInTheDocument();
    expect(screen.getByText("1 game")).toBeInTheDocument();
  });

  it("de-emphasizes rate stats from a small postseason sample", () => {
    const splits = makeSplits({
      REGULAR: makeAverages({ gamesPlayed: 70, threePointPercentage: 38, pointsPerGame: 25 }),
      FINALS: makeAverages({ gamesPlayed: 2, threePointPercentage: 100, pointsPerGame: 30 }),
    });

    render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

    // A 100% three-point rate off two games is noise, and is dimmed and
    // explained rather than presented as an 82-game figure would be.
    const smallSampleRate = screen.getByText("100.0%");
    expect(smallSampleRate).toHaveClass("text-text-muted");
    expect(smallSampleRate).toHaveAttribute("title", expect.stringContaining("Only 2 games"));

    // Counting stats from the same segment aren't dimmed — a small sample
    // distorts rates far more than it distorts points per game.
    expect(screen.getByText("30.0")).toHaveClass("text-text-primary");
  });

  describe("advanced stat rows", () => {
    it("renders a missing figure as a dash rather than zero", () => {
      // Rows ingested before the advanced columns existed have no usage
      // rate. Showing 0.0% would claim the player never touched the ball,
      // which is a real measurement rather than an absent one.
      const splits = makeSplits({
        REGULAR: makeAverages({ gamesPlayed: 70, usagePercentage: null }),
        PLAYOFFS: makeAverages({ gamesPlayed: 12, usagePercentage: null }),
      });

      render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

      // Scoped to the usage row: the shooting percentages above it are
      // genuinely 0% in this fixture and should keep saying so.
      const usageRow = screen.getByRole("row", { name: /USG%/ });
      expect(within(usageRow).getAllByText("—").length).toBe(2);
      expect(within(usageRow).queryByText("0.0%")).not.toBeInTheDocument();
    });

    it("shows no delta when the baseline figure is missing", () => {
      // Comparing against a missing regular season would treat "not
      // recorded" as zero and invent a change that never happened.
      const splits = makeSplits({
        REGULAR: makeAverages({ gamesPlayed: 70, usagePercentage: null }),
        PLAYOFFS: makeAverages({ gamesPlayed: 12, usagePercentage: 31.5 }),
      });

      render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

      expect(screen.getByText("31.5%")).toBeInTheDocument();
      expect(screen.queryByText("+31.5%")).not.toBeInTheDocument();
    });

    it("signs plus/minus explicitly so a positive margin reads as one", () => {
      const splits = makeSplits({
        REGULAR: makeAverages({ gamesPlayed: 70, plusMinusPerGame: 3.2 }),
        PLAYOFFS: makeAverages({ gamesPlayed: 12, plusMinusPerGame: 5.4 }),
      });

      render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

      expect(screen.getByText("+3.2")).toBeInTheDocument();
      expect(screen.getByText("+5.4")).toBeInTheDocument();
    });

    it("colours a falling defensive rating as an improvement", () => {
      // Defensive rating is points conceded per 100 possessions, so a drop
      // is a better defence. Without inverting, the table would paint a
      // playoff defensive improvement red.
      const splits = makeSplits({
        REGULAR: makeAverages({ gamesPlayed: 70, defensiveRating: 114 }),
        PLAYOFFS: makeAverages({ gamesPlayed: 12, defensiveRating: 108 }),
      });

      render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

      const delta = screen.getByText("−6.0");
      expect(delta).toHaveClass("text-emerald-400");
    });

    it("still colours a rising offensive rating as an improvement", () => {
      const splits = makeSplits({
        REGULAR: makeAverages({ gamesPlayed: 70, offensiveRating: 110 }),
        PLAYOFFS: makeAverages({ gamesPlayed: 12, offensiveRating: 118 }),
      });

      render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

      expect(screen.getByText("+8.0")).toHaveClass("text-emerald-400");
    });

    it("shows assist-to-turnover at two decimal places", () => {
      const splits = makeSplits({
        REGULAR: makeAverages({ gamesPlayed: 70, assistToTurnoverRatio: 2.5 }),
        PLAYOFFS: makeAverages({ gamesPlayed: 12, assistToTurnoverRatio: 1.75 }),
      });

      render(<SeasonSplitsTable splits={splits} playerName="LeBron James" />);

      expect(screen.getByText("1.75")).toBeInTheDocument();
    });
  });
});
