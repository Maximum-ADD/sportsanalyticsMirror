import { describe, expect, it } from "vitest";
import { deriveSeasonAverages, type DerivedSeasonAverages } from "../players/season-averages.js";
import {
  applyValuationModel,
  describeDrivers,
  featureRow,
  findComparables,
  levelFactorFor,
  projectSlot,
  valueForSlot,
  valueInterval,
  type ValuationModelBundle,
} from "./valuation-model.js";

// A hand-built bundle with an obvious model: slot = 60 - 2 * points. Clean on
// purpose — these tests check that the TRAINED model is APPLIED correctly,
// not how good the model is, which the trainer records as MAE at fit time.
function makeBundle(overrides: Partial<ValuationModelBundle> = {}): ValuationModelBundle {
  const firstRound: Record<string, number> = {};
  for (let pick = 1; pick <= 30; pick += 1) firstRound[String(pick)] = 13_000_000 - pick * 350_000;
  return {
    modelVersion: "test-2.0.0",
    featureNames: ["points_per_game", "rebounds_per_game", "assists_per_game", "true_shooting"],
    coefficients: [60, -2, 0, 0, 0],
    minimumGamesRequired: 10,
    slotBounds: { min: 1, max: 75 },
    rookieScale: {
      year: "2025-26",
      firstRoundPicks: 30,
      draftPicks: 60,
      firstRound,
      secondRoundValue: 600_000,
      undraftedValue: 85_000,
    },
    levelFactors: {
      NCAA_D1: { factor: 1, basis: "Division I is the reference level." },
      NCAA_D2: { factor: 0.5, basis: "Division II production is translated against Division I output." },
    },
    unknownLevelFactor: { factor: 0.15, basis: "This competition level is not recognised." },
    interval: { baseFraction: 0.28, shortLogGames: 25, shortLogExtraFraction: 0.15 },
    comparableIndex: [
      { playerId: "scorer", draftNumber: 5, features: [22, 5, 3, 58] },
      { playerId: "role", draftNumber: 30, features: [8, 3, 1, 52] },
      { playerId: "guard", draftNumber: 12, features: [15, 3, 6, 55] },
      { playerId: "big", draftNumber: 20, features: [11, 9, 1, 60] },
    ],
    ...overrides,
  };
}

// A line with the given points per game, built through the real derivation so
// every other figure is internally consistent.
function lineWith(points: number, assists = 3): DerivedSeasonAverages {
  return deriveSeasonAverages([
    {
      minutes: 32,
      points,
      rebounds: 6,
      assists,
      steals: 1,
      blocks: 1,
      turnovers: 2,
      fieldGoalsMade: Math.round(points / 2.5),
      fieldGoalsAttempted: Math.round(points / 1.2) + 1,
      threesMade: 1,
      threesAttempted: 3,
      freeThrowsMade: 2,
      freeThrowsAttempted: 3,
      plusMinus: null,
      usagePercentage: null,
      offensiveRating: null,
      defensiveRating: null,
    },
  ]);
}

describe("applyValuationModel", () => {
  // Below the floor the honest answer is no figure at all — never a zero.
  it("returns no valuation for a season below the games floor", () => {
    expect(
      applyValuationModel(makeBundle(), {
        averages: lineWith(20),
        competitionLevel: "NCAA_D1",
        gamesLogged: 9,
      })
    ).toBeNull();
  });

  it("projects a slot and prices it on the published scale", () => {
    const result = applyValuationModel(makeBundle(), {
      averages: lineWith(20),
      competitionLevel: "NCAA_D1",
      gamesLogged: 30,
    });

    // 60 - 2 * 20 = 20.
    expect(result?.projectedDraftSlot).toBe(20);
    expect(result?.projectedValueUsd).toBe(makeBundle().rookieScale.firstRound["20"]);
    expect(result?.rookieScaleYear).toBe("2025-26");
  });

  // The level factor discounts production BEFORE the model sees it: a Division
  // II player's 20 points are scored as 10.
  it("discounts production for the competition level before projecting", () => {
    const result = applyValuationModel(makeBundle(), {
      averages: lineWith(20),
      competitionLevel: "NCAA_D2",
      gamesLogged: 30,
    });

    // 60 - 2 * 10 = 40 -> second round.
    expect(result?.projectedDraftSlot).toBe(40);
    expect(result?.projectedValueUsd).toBe(600_000);
    expect(result?.levelFactor).toBe(0.5);
    expect(result?.levelFactorBasis).toMatch(/Division II/);
  });

  it("records which comparables it drew and how alike they are", () => {
    const result = applyValuationModel(makeBundle(), {
      averages: lineWith(20),
      competitionLevel: "NCAA_D1",
      gamesLogged: 30,
    });

    expect(result?.comparablePlayerIds).toHaveLength(3);
    expect(result?.comparableScores).toHaveLength(3);
  });
});

describe("projectSlot", () => {
  // A linear fit extrapolates; a pick number has bounds.
  it("clamps a spectacular line to the first pick", () => {
    expect(projectSlot(makeBundle(), [60, 0, 0, 0])).toBe(1);
  });

  it("clamps a line below the data into the undrafted range", () => {
    expect(projectSlot(makeBundle({ coefficients: [200, -2, 0, 0, 0] }), [0, 0, 0, 0])).toBe(75);
  });
});

describe("valueForSlot", () => {
  it("prices the first round from the scale", () => {
    expect(valueForSlot(makeBundle(), 1)).toBe(makeBundle().rookieScale.firstRound["1"]);
    expect(valueForSlot(makeBundle(), 30)).toBe(makeBundle().rookieScale.firstRound["30"]);
  });

  it("uses the flat two-way figure through the second round", () => {
    expect(valueForSlot(makeBundle(), 31)).toBe(600_000);
    expect(valueForSlot(makeBundle(), 60)).toBe(600_000);
  });

  // "Undrafted" is a camp deal, which is a real figure — not zero.
  it("uses the camp-deal figure past the draft", () => {
    expect(valueForSlot(makeBundle(), 61)).toBe(85_000);
  });
});

describe("levelFactorFor", () => {
  // Under-claiming is the right failure direction for a figure presented as
  // somebody's professional value.
  it("falls back to the most conservative factor for an unrecognised level", () => {
    const { factor, basis } = levelFactorFor(makeBundle(), "SOMETHING_NEW");

    expect(factor).toBe(0.15);
    expect(basis).toMatch(/not recognised/);
  });
});

describe("featureRow", () => {
  it("reads features in the order the model was trained on", () => {
    const bundle = makeBundle({
      featureNames: ["assists_per_game", "points_per_game", "rebounds_per_game", "true_shooting"],
    });
    const row = featureRow(bundle, lineWith(20, 7));

    expect(row[0]).toBe(7);
    expect(row[1]).toBe(20);
  });

  // A re-trained model with a feature this API cannot supply must fail loudly
  // rather than apply its weights to whatever happens to be in that position.
  it("refuses a feature it does not know how to supply", () => {
    const bundle = makeBundle({ featureNames: ["wingspan", "points_per_game", "rebounds_per_game", "true_shooting"] });

    expect(() => featureRow(bundle, lineWith(20))).toThrow(/wingspan/);
  });
});

describe("valueInterval", () => {
  it("brackets the point estimate", () => {
    const { low, high } = valueInterval(makeBundle(), 4_000_000, 40);

    expect(low).toBeLessThan(4_000_000);
    expect(high).toBeGreaterThan(4_000_000);
  });

  // A short log's line is still settling, so it genuinely supports less.
  it("widens for a short game log", () => {
    const long = valueInterval(makeBundle(), 4_000_000, 40);
    const short = valueInterval(makeBundle(), 4_000_000, 11);

    expect(short.high - short.low).toBeGreaterThan(long.high - long.low);
  });

  // No pick pays more than the top of the scale; a band past it would quote
  // money no draft slot carries.
  it("never reaches above what the first pick is paid", () => {
    const topOfScale = valueForSlot(makeBundle(), 1);

    expect(valueInterval(makeBundle(), topOfScale, 11).high).toBe(topOfScale);
  });

  it("never reaches below the floor of the scale", () => {
    expect(valueInterval(makeBundle(), 85_000, 10).low).toBe(85_000);
  });
});

describe("findComparables", () => {
  it("returns the closest rookie seasons first", () => {
    const comparables = findComparables(makeBundle(), [22, 5, 3, 58]);

    expect(comparables[0].playerId).toBe("scorer");
    expect(comparables[0].similarity).toBe(1);
  });

  it("scores similarity between zero and one", () => {
    for (const comparable of findComparables(makeBundle(), [15, 4, 3, 55])) {
      expect(comparable.similarity).toBeGreaterThanOrEqual(0);
      expect(comparable.similarity).toBeLessThanOrEqual(1);
    }
  });

  it("offers three comparables by default", () => {
    expect(findComparables(makeBundle(), [15, 4, 3, 55])).toHaveLength(3);
  });

  it("offers none when the model has no rookie index", () => {
    expect(findComparables(makeBundle({ comparableIndex: [] }), [15, 4, 3, 55])).toEqual([]);
  });

  // Standardising stops points (wide spread) from swamping assists (narrow).
  it("weighs a narrow-spread feature on the same footing as a wide one", () => {
    const comparables = findComparables(makeBundle(), [14, 3, 6, 55]);

    expect(comparables[0].playerId).toBe("guard");
  });
});

describe("describeDrivers", () => {
  // The level is the figure's provenance, printed once beside it — never
  // repeated here as a driver.
  it("names scoring and efficiency, and leaves the level to the provenance line", () => {
    const labels = describeDrivers(lineWith(24, 2), 0.62).map((driver) => driver.label);

    expect(labels).toEqual(["Scoring", "Efficiency"]);
  });

  it("shows the level-adjusted scoring figure", () => {
    const [scoring] = describeDrivers(lineWith(24, 2), 0.5);

    expect(scoring.detail).toContain("12.0");
  });

  // "1.1 assists per game" is noise, not a driver.
  it("only mentions playmaking when there is something to say", () => {
    expect(describeDrivers(lineWith(24, 1), 1).map((d) => d.label)).not.toContain("Playmaking");
    expect(describeDrivers(lineWith(24, 7), 1).map((d) => d.label)).toContain("Playmaking");
  });
});
