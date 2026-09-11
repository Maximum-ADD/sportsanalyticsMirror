import { render, screen } from "@testing-library/react";
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
});
