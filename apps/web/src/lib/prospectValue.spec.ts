import { describe, expect, it } from "vitest";
import {
  COMPETITION_LEVELS_IN_ORDER,
  COMPETITION_LEVEL_LABELS,
  COMPETITION_LEVEL_SHORT_LABELS,
  RELIABILITY_TIER_LABELS,
  deriveSeasonAverages,
  describeRankState,
  describeReliability,
  formatDraftSlot,
  formatProjectedValue,
  formatRank,
  formatReliabilityScore,
  formatValueRange,
  hasAttempts,
} from "./prospectValue";
import type { CompetitionLevel, ProspectGameInput, ProspectReliability } from "@/types/nba";

function makeGame(overrides: Partial<ProspectGameInput> = {}): ProspectGameInput {
  return {
    gameDate: "2026-01-15",
    opponent: "Lincoln High",
    minutes: 30,
    points: 20,
    rebounds: 6,
    assists: 4,
    steals: 2,
    blocks: 1,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 16,
    threesMade: 2,
    threesAttempted: 5,
    freeThrowsMade: 2,
    freeThrowsAttempted: 2,
    ...overrides,
  };
}

describe("labels", () => {
  it("has a full and a short label for every competition level", () => {
    for (const level of COMPETITION_LEVELS_IN_ORDER) {
      expect(COMPETITION_LEVEL_LABELS[level]).toBeTruthy();
      expect(COMPETITION_LEVEL_SHORT_LABELS[level]).toBeTruthy();
    }
  });

  // Guards against a level being added to the union without a label, which
  // would otherwise render a raw enum slug to a user.
  it("orders every member of the CompetitionLevel union", () => {
    const declared = Object.keys(COMPETITION_LEVEL_LABELS) as CompetitionLevel[];
    expect([...COMPETITION_LEVELS_IN_ORDER].sort()).toEqual([...declared].sort());
  });

  it("names every reliability tier in words", () => {
    expect(RELIABILITY_TIER_LABELS.UNDOCUMENTED).toBeTruthy();
    expect(RELIABILITY_TIER_LABELS.PARTIAL).toBeTruthy();
    expect(RELIABILITY_TIER_LABELS.STRONG).toBeTruthy();
  });
});

describe("formatProjectedValue", () => {
  it("renders millions to two decimals", () => {
    expect(formatProjectedValue(4_368_000)).toBe("$4.37M");
  });

  it("renders thousands to the nearest thousand", () => {
    expect(formatProjectedValue(820_000)).toBe("$820K");
  });

  it("renders small figures in full", () => {
    expect(formatProjectedValue(950)).toBe("$950");
  });

  // Null is "we have not priced this player", which is not the same claim as
  // "we priced them at nothing".
  it("renders an absent figure as an em dash, never as zero", () => {
    expect(formatProjectedValue(null)).toBe("—");
  });
});

describe("formatValueRange", () => {
  it("renders both ends", () => {
    expect(formatValueRange(3_100_000, 5_900_000)).toBe("$3.10M – $5.90M");
  });

  it("refuses half an interval", () => {
    expect(formatValueRange(3_100_000, null)).toBe("—");
    expect(formatValueRange(null, 5_900_000)).toBe("—");
  });
});

describe("formatDraftSlot", () => {
  it("names a first-round slot", () => {
    expect(formatDraftSlot(1)).toBe("Slot 1");
    expect(formatDraftSlot(30)).toBe("Slot 30");
  });

  it("collapses the second round", () => {
    expect(formatDraftSlot(31)).toBe("2nd round");
    expect(formatDraftSlot(60)).toBe("2nd round");
  });

  it("names the undrafted range past the draft", () => {
    expect(formatDraftSlot(61)).toBe("Undrafted range");
  });

  it("renders an absent slot as an em dash", () => {
    expect(formatDraftSlot(null)).toBe("—");
  });
});

describe("formatRank", () => {
  it("prefixes a rank with a hash", () => {
    expect(formatRank(12)).toBe("#12");
  });

  // The word, not nothing — a silently absent rank on a page with room to
  // explain reads as a bug.
  it("uses a word for an absent rank", () => {
    expect(formatRank(null)).toBe("Unranked");
  });
});

describe("describeRankState", () => {
  it("says nothing when the prospect is ranked", () => {
    expect(describeRankState("RANKED", 20, 10)).toBeNull();
  });

  it("counts the shortfall below the games floor", () => {
    expect(describeRankState("BELOW_GAMES_FLOOR", 7, 10)).toContain("3 more games needed");
  });

  it("uses the singular for a one-game shortfall", () => {
    expect(describeRankState("BELOW_GAMES_FLOOR", 9, 10)).toContain("1 more game needed");
  });

  // Distinguishing these is the point: a qualified user waiting on a model run
  // must not read the same sentence as a user who is short of games.
  it("distinguishes waiting on the model from being short of games", () => {
    expect(describeRankState("AWAITING_VALUATION", 20, 10)).toContain("waiting on the next valuation");
    expect(describeRankState("HIDDEN", 20, 10)).toContain("not shown on the public board");
  });
});

describe("reliability formatting", () => {
  function makeReliability(overrides: Partial<ProspectReliability> = {}): ProspectReliability {
    return {
      gamesLogged: 14,
      gamesVerified: 4,
      gamesDocumented: 9,
      verifiedCoverage: 4 / 14,
      documentedCoverage: 9 / 14,
      tier: "PARTIAL",
      score: 38,
      ...overrides,
    };
  }

  // The likeliest bug in the whole feature, pinned in both directions.
  it("renders a zero score as zero when games are on record", () => {
    expect(formatReliabilityScore(0)).toBe("0");
  });

  it("renders an em dash only when there is no score at all", () => {
    expect(formatReliabilityScore(null)).toBe("—");
  });

  it("states the verified fraction in words", () => {
    expect(describeReliability(makeReliability())).toContain("4 of 14 games verified");
  });

  it("mentions documented-but-unverified games when they differ", () => {
    expect(describeReliability(makeReliability())).toContain("9 documented");
  });

  it("omits the documented note when nothing is merely documented", () => {
    const described = describeReliability(makeReliability({ gamesDocumented: 4 }));
    expect(described).not.toContain("documented");
  });

  it("says so when no games are logged", () => {
    expect(describeReliability(makeReliability({ gamesLogged: 0 }))).toBe("No games logged yet.");
  });
});

describe("deriveSeasonAverages", () => {
  it("returns a zeroed line with nulls for the figures an amateur sheet cannot carry", () => {
    const averages = deriveSeasonAverages([]);

    expect(averages.gamesPlayed).toBe(0);
    expect(averages.pointsPerGame).toBe(0);
    expect(averages.assistToTurnoverRatio).toBeNull();
    expect(averages.plusMinusPerGame).toBeNull();
    expect(averages.usagePercentage).toBeNull();
    expect(averages.offensiveRating).toBeNull();
    expect(averages.defensiveRating).toBeNull();
  });

  it("averages counting stats per game", () => {
    const averages = deriveSeasonAverages([
      makeGame({ points: 20, rebounds: 6 }),
      makeGame({ points: 30, rebounds: 8 }),
    ]);

    expect(averages.gamesPlayed).toBe(2);
    expect(averages.pointsPerGame).toBe(25);
    expect(averages.reboundsPerGame).toBe(7);
  });

  // The rule the API's own comment calls out: a 1-for-1 night and a 5-for-20
  // night average to 52.5% per game but are really 6-for-21 = 28.6%.
  it("computes percentages from season totals, not by averaging per-game rates", () => {
    const averages = deriveSeasonAverages([
      makeGame({ fieldGoalsMade: 1, fieldGoalsAttempted: 1 }),
      makeGame({ fieldGoalsMade: 5, fieldGoalsAttempted: 20 }),
    ]);

    expect(averages.fieldGoalPercentage).toBe(28.6);
    expect(averages.fieldGoalPercentage).not.toBe(52.5);
  });

  // Matches the API's percentageOf, which returns 0 rather than null because
  // SeasonAverages types all three shooting percentages as plain numbers.
  it("returns zero — not null — for a percentage with no attempts", () => {
    const averages = deriveSeasonAverages([
      makeGame({ threesMade: 0, threesAttempted: 0 }),
    ]);

    expect(averages.threePointPercentage).toBe(0);
    // ...and the caller is expected to suppress it using the attempts figure.
    expect(hasAttempts(averages.threesAttemptedPerGame)).toBe(false);
  });

  it("leaves assist-to-turnover undefined when no turnovers were committed", () => {
    const averages = deriveSeasonAverages([makeGame({ assists: 6, turnovers: 0 })]);

    expect(averages.assistToTurnoverRatio).toBeNull();
  });

  it("computes assist-to-turnover from totals at two decimals", () => {
    const averages = deriveSeasonAverages([
      makeGame({ assists: 5, turnovers: 2 }),
      makeGame({ assists: 4, turnovers: 3 }),
    ]);

    expect(averages.assistToTurnoverRatio).toBe(1.8);
  });

  it("derives true shooting from totals with the 0.44 free-throw weight", () => {
    // 20 points on 16 field-goal attempts and 2 free-throw attempts:
    // 20 / (2 * (16 + 0.44*2)) * 100 = 59.2%
    const averages = deriveSeasonAverages([makeGame()]);

    expect(averages.trueShootingPercentage).toBe(59.2);
  });

  it("derives effective field goal percentage crediting threes at a half", () => {
    // (8 + 0.5*2) / 16 * 100 = 56.3%
    const averages = deriveSeasonAverages([makeGame()]);

    expect(averages.effectiveFieldGoalPercentage).toBe(56.3);
  });

  it("returns zero true shooting rather than dividing by nothing", () => {
    const averages = deriveSeasonAverages([
      makeGame({ fieldGoalsAttempted: 0, freeThrowsAttempted: 0, points: 0, fieldGoalsMade: 0, threesMade: 0, threesAttempted: 0, freeThrowsMade: 0 }),
    ]);

    expect(averages.trueShootingPercentage).toBe(0);
    expect(averages.effectiveFieldGoalPercentage).toBe(0);
  });
});

describe("hasAttempts", () => {
  it("distinguishes a real zero percentage from a meaningless one", () => {
    expect(hasAttempts(4.2)).toBe(true);
    expect(hasAttempts(0)).toBe(false);
  });
});
