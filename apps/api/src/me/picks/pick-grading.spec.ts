import { PickOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  calculateHitRate,
  determineModelFavoriteTeamId,
  determineWinningTeamId,
  gradePickAgainstWinner,
  summarizeHeadToHeadRecord,
  summarizePickRecord,
  toHeadToHeadOutcome,
  type GradedPick,
  type HeadToHeadOutcome,
} from "./pick-grading.js";

const HOME_TEAM_ID = "team-home";
const AWAY_TEAM_ID = "team-away";

// A played game the home side won, unless overridden.
function makeFinalScore(overrides: Partial<GradedPick["game"]> = {}): GradedPick["game"] {
  return {
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    homeScore: 110,
    awayScore: 100,
    ...overrides,
  };
}

// A call the user got right on a game the model also called right: the model
// favoured the home team (0.7) and the home team won.
function makePick(overrides: Partial<GradedPick> = {}): GradedPick {
  return {
    outcome: PickOutcome.CORRECT,
    modelHomeWinProbabilityAtPick: 0.7,
    game: makeFinalScore(),
    ...overrides,
  };
}

function makeOutcome(userOutcome: PickOutcome, modelOutcome: PickOutcome): HeadToHeadOutcome {
  return { userOutcome, modelOutcome };
}

describe("determineWinningTeamId", () => {
  it("names the home team when the home team outscored the away team", () => {
    expect(determineWinningTeamId(makeFinalScore({ homeScore: 110, awayScore: 100 }))).toBe(HOME_TEAM_ID);
  });

  it("names the away team when the away team outscored the home team", () => {
    expect(determineWinningTeamId(makeFinalScore({ homeScore: 98, awayScore: 101 }))).toBe(AWAY_TEAM_ID);
  });

  it("returns null for a game that has not been played yet", () => {
    expect(determineWinningTeamId(makeFinalScore({ homeScore: null, awayScore: null }))).toBeNull();
  });

  it("returns null when only one half of the score has been ingested", () => {
    expect(determineWinningTeamId(makeFinalScore({ homeScore: 110, awayScore: null }))).toBeNull();
    expect(determineWinningTeamId(makeFinalScore({ homeScore: null, awayScore: 100 }))).toBeNull();
  });

  it("returns null for an equal score rather than inventing a winner", () => {
    expect(determineWinningTeamId(makeFinalScore({ homeScore: 100, awayScore: 100 }))).toBeNull();
  });
});

describe("gradePickAgainstWinner", () => {
  it("grades a call on the winning team CORRECT", () => {
    expect(gradePickAgainstWinner(HOME_TEAM_ID, HOME_TEAM_ID)).toBe(PickOutcome.CORRECT);
  });

  it("grades a call on the losing team MISSED", () => {
    expect(gradePickAgainstWinner(AWAY_TEAM_ID, HOME_TEAM_ID)).toBe(PickOutcome.MISSED);
  });
});

describe("determineModelFavoriteTeamId", () => {
  const teams = { homeTeamId: HOME_TEAM_ID, awayTeamId: AWAY_TEAM_ID };

  it("reads a probability above a coin flip as a call on the home team", () => {
    expect(determineModelFavoriteTeamId(teams, 0.62)).toBe(HOME_TEAM_ID);
  });

  it("reads a probability below a coin flip as a call on the away team", () => {
    expect(determineModelFavoriteTeamId(teams, 0.38)).toBe(AWAY_TEAM_ID);
  });

  it("breaks an exact coin flip toward the home team", () => {
    expect(determineModelFavoriteTeamId(teams, 0.5)).toBe(HOME_TEAM_ID);
  });

  it("handles the extremes of the probability range", () => {
    expect(determineModelFavoriteTeamId(teams, 1)).toBe(HOME_TEAM_ID);
    expect(determineModelFavoriteTeamId(teams, 0)).toBe(AWAY_TEAM_ID);
  });
});

describe("toHeadToHeadOutcome", () => {
  it("grades the model on the same game the user was graded on", () => {
    const pick = makePick({ outcome: PickOutcome.CORRECT, modelHomeWinProbabilityAtPick: 0.7 });
    expect(toHeadToHeadOutcome(pick)).toEqual({
      userOutcome: PickOutcome.CORRECT,
      modelOutcome: PickOutcome.CORRECT,
    });
  });

  it("scores the model MISSED when it favoured the side that lost", () => {
    // The model gave the home team a 30% chance, so it was calling the away
    // team — and the home team won.
    const pick = makePick({ outcome: PickOutcome.CORRECT, modelHomeWinProbabilityAtPick: 0.3 });
    expect(toHeadToHeadOutcome(pick)?.modelOutcome).toBe(PickOutcome.MISSED);
  });

  it("carries the user's stored outcome through untouched", () => {
    const pick = makePick({ outcome: PickOutcome.MISSED });
    expect(toHeadToHeadOutcome(pick)?.userOutcome).toBe(PickOutcome.MISSED);
  });

  it("returns null for a game with no decided winner, so neither side is scored on it", () => {
    expect(toHeadToHeadOutcome(makePick({ game: makeFinalScore({ homeScore: null, awayScore: null }) }))).toBeNull();
  });
});

describe("calculateHitRate", () => {
  it("divides wins by total", () => {
    expect(calculateHitRate(3, 4)).toBe(0.75);
  });

  it("rounds a repeating ratio instead of returning floating point noise", () => {
    expect(calculateHitRate(3, 7)).toBe(0.4286);
  });

  it("returns 0 for a user who has called nothing, rather than NaN", () => {
    expect(calculateHitRate(0, 0)).toBe(0);
  });

  it("returns 1 for a perfect record and 0 for a blank one", () => {
    expect(calculateHitRate(5, 5)).toBe(1);
    expect(calculateHitRate(0, 5)).toBe(0);
  });
});

describe("summarizePickRecord", () => {
  it("counts the user's wins and losses", () => {
    const record = summarizePickRecord([
      makeOutcome(PickOutcome.CORRECT, PickOutcome.CORRECT),
      makeOutcome(PickOutcome.CORRECT, PickOutcome.MISSED),
      makeOutcome(PickOutcome.MISSED, PickOutcome.CORRECT),
      makeOutcome(PickOutcome.MISSED, PickOutcome.MISSED),
    ]);
    expect(record.wins).toBe(2);
    expect(record.losses).toBe(2);
    expect(record.total).toBe(4);
    expect(record.hitRate).toBe(0.5);
  });

  it("counts the model's record independently of the user's on the same games", () => {
    const record = summarizePickRecord([
      makeOutcome(PickOutcome.CORRECT, PickOutcome.MISSED),
      makeOutcome(PickOutcome.CORRECT, PickOutcome.MISSED),
      makeOutcome(PickOutcome.MISSED, PickOutcome.CORRECT),
    ]);
    expect(record.wins).toBe(2);
    expect(record.modelWins).toBe(1);
    expect(record.modelLosses).toBe(2);
  });

  it("gives both sides the same denominator, so the comparison is head-to-head", () => {
    const record = summarizePickRecord([
      makeOutcome(PickOutcome.CORRECT, PickOutcome.CORRECT),
      makeOutcome(PickOutcome.MISSED, PickOutcome.CORRECT),
      makeOutcome(PickOutcome.MISSED, PickOutcome.CORRECT),
    ]);
    expect(record.wins + record.losses).toBe(record.total);
    expect(record.modelWins + record.modelLosses).toBe(record.total);
    expect(record.hitRate).toBe(0.3333);
    expect(record.modelHitRate).toBe(1);
  });

  it("returns a zeroed record for a user who has called nothing", () => {
    expect(summarizePickRecord([])).toEqual({
      wins: 0,
      losses: 0,
      total: 0,
      hitRate: 0,
      modelWins: 0,
      modelLosses: 0,
      modelHitRate: 0,
    });
  });
});

describe("summarizeHeadToHeadRecord", () => {
  it("grades and totals stored picks in one step", () => {
    // Two calls: the user beat the model on the second one, where the model
    // favoured the home team (0.8) but the away team actually won.
    const record = summarizeHeadToHeadRecord([
      makePick({ outcome: PickOutcome.CORRECT, modelHomeWinProbabilityAtPick: 0.8 }),
      makePick({
        outcome: PickOutcome.CORRECT,
        modelHomeWinProbabilityAtPick: 0.8,
        game: makeFinalScore({ homeScore: 95, awayScore: 105 }),
      }),
    ]);
    expect(record).toEqual({
      wins: 2,
      losses: 0,
      total: 2,
      hitRate: 1,
      modelWins: 1,
      modelLosses: 1,
      modelHitRate: 0.5,
    });
  });

  it("drops a pick whose game lost its final score, rather than scoring it as a loss", () => {
    const record = summarizeHeadToHeadRecord([
      makePick({ outcome: PickOutcome.CORRECT }),
      makePick({ game: makeFinalScore({ homeScore: null, awayScore: null }) }),
    ]);
    expect(record.total).toBe(1);
    expect(record.wins).toBe(1);
    expect(record.losses).toBe(0);
  });

  it("returns a zeroed record when the user has no picks at all", () => {
    expect(summarizeHeadToHeadRecord([])).toMatchObject({ total: 0, hitRate: 0, modelHitRate: 0 });
  });
});
