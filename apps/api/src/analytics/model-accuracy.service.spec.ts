import { beforeEach, describe, expect, it } from "vitest";
import type { EvaluatedGame } from "./evaluated-game.js";
import { ModelAccuracyService } from "./model-accuracy.service.js";

const DEFAULT_GAME_DATE = new Date("2026-01-10T00:00:00.000Z");
const DEFAULT_PREDICTION_DATE = new Date("2026-01-09T00:00:00.000Z");

// A home win by default (110-100) with a mild home favourite, so each test
// only has to state the one field it is actually about.
function buildEvaluatedGame(overrides: Partial<EvaluatedGame> = {}): EvaluatedGame {
  return {
    gameId: "game-1",
    gameDate: DEFAULT_GAME_DATE,
    homeScore: 110,
    awayScore: 100,
    homeWinProbability: 0.6,
    predictionCreatedAt: DEFAULT_PREDICTION_DATE,
    ...overrides,
  };
}

// A game the home team lost, 100-110.
function buildHomeLossGame(overrides: Partial<EvaluatedGame> = {}): EvaluatedGame {
  return buildEvaluatedGame({ homeScore: 100, awayScore: 110, ...overrides });
}

describe("ModelAccuracyService", () => {
  let modelAccuracyService: ModelAccuracyService;

  beforeEach(() => {
    modelAccuracyService = new ModelAccuracyService();
  });

  describe("with no evaluable games", () => {
    it("reports null rates rather than zeroes, because nothing was scored", () => {
      const report = modelAccuracyService.buildAccuracyReport([]);

      expect(report.accuracy).toBeNull();
      expect(report.brierScore).toBeNull();
      expect(report.homeBaselineAccuracy).toBeNull();
      expect(report.gamesEvaluated).toBe(0);
      expect(report.forwardPredictionCount).toBe(0);
    });

    it("still returns all five bands, empty, so the response shape never varies", () => {
      const report = modelAccuracyService.buildAccuracyReport([]);

      expect(report.calibration.map((band) => band.band)).toEqual([
        "50-60",
        "60-70",
        "70-80",
        "80-90",
        "90-100",
      ]);
      expect(report.calibration.every((band) => band.gamesInBand === 0)).toBe(true);
      expect(report.calibration.every((band) => band.meanPredicted === null)).toBe(true);
      expect(report.calibration.every((band) => band.actualWinRate === null)).toBe(true);
    });
  });

  describe("brierScore", () => {
    it("is the mean squared error against the actual home result", () => {
      // (0.6 - 1)^2 = 0.16 for the home win, (0.3 - 0)^2 = 0.09 for the home
      // loss; (0.16 + 0.09) / 2 = 0.125.
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.6 }),
        buildHomeLossGame({ homeWinProbability: 0.3 }),
      ]);

      expect(report.brierScore).toBe(0.125);
    });

    it("is 0 for a perfect prediction and 1 for a maximally wrong one", () => {
      const perfectReport = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 1 }),
      ]);
      const wrongReport = modelAccuracyService.buildAccuracyReport([
        buildHomeLossGame({ homeWinProbability: 1 }),
      ]);

      expect(perfectReport.brierScore).toBe(0);
      expect(wrongReport.brierScore).toBe(1);
    });

    it("scores a coin-flip prediction at 0.25 whichever way the game went", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.5 }),
        buildHomeLossGame({ homeWinProbability: 0.5 }),
      ]);

      expect(report.brierScore).toBe(0.25);
    });
  });

  describe("accuracy", () => {
    it("counts a game as called correctly when the model's favourite won, either side", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.6 }),
        buildHomeLossGame({ homeWinProbability: 0.3 }),
      ]);

      expect(report.accuracy).toBe(1);
      expect(report.gamesEvaluated).toBe(2);
    });

    it("counts a game as missed when the model's favourite lost", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildHomeLossGame({ homeWinProbability: 0.8 }),
        buildEvaluatedGame({ homeWinProbability: 0.2 }),
      ]);

      expect(report.accuracy).toBe(0);
    });

    it("treats exactly 0.5 as a pick for the home team", () => {
      const homeWinReport = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.5 }),
      ]);
      const homeLossReport = modelAccuracyService.buildAccuracyReport([
        buildHomeLossGame({ homeWinProbability: 0.5 }),
      ]);

      expect(homeWinReport.accuracy).toBe(1);
      expect(homeLossReport.accuracy).toBe(0);
    });

    it("rounds to four decimal places", () => {
      // Two of three called correctly: 2 / 3 = 0.666...
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.6 }),
        buildEvaluatedGame({ homeWinProbability: 0.6 }),
        buildHomeLossGame({ homeWinProbability: 0.6 }),
      ]);

      expect(report.accuracy).toBe(0.6667);
    });
  });

  describe("homeBaselineAccuracy", () => {
    it("is the share of the same games the home team won, ignoring the model entirely", () => {
      // Home wins two of three; the model's probabilities are deliberately
      // hopeless, and must not move the baseline.
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.05 }),
        buildEvaluatedGame({ homeWinProbability: 0.05 }),
        buildHomeLossGame({ homeWinProbability: 0.95 }),
      ]);

      expect(report.homeBaselineAccuracy).toBe(0.6667);
      expect(report.accuracy).toBe(0);
    });

    it("can beat the model, which is the whole point of reporting it", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.4 }),
        buildEvaluatedGame({ homeWinProbability: 0.4 }),
      ]);

      expect(report.homeBaselineAccuracy).toBe(1);
      expect(report.accuracy).toBe(0);
    });
  });

  describe("forwardPredictionCount", () => {
    it("counts only predictions written strictly before tip-off", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ predictionCreatedAt: new Date("2026-01-09T12:00:00.000Z") }),
        buildEvaluatedGame({ predictionCreatedAt: new Date("2026-01-11T12:00:00.000Z") }),
        buildEvaluatedGame({ predictionCreatedAt: DEFAULT_GAME_DATE }),
      ]);

      expect(report.gamesEvaluated).toBe(3);
      expect(report.forwardPredictionCount).toBe(1);
    });

    it("is 0, not null, when every prediction was backfilled after the fact", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ predictionCreatedAt: new Date("2026-02-01T00:00:00.000Z") }),
      ]);

      expect(report.forwardPredictionCount).toBe(0);
      expect(report.gamesEvaluated).toBe(1);
    });
  });

  describe("calibration bands", () => {
    it("buckets on the favourite's probability, so a confident away pick lands in a high band", () => {
      // p = 0.15 makes the away team an 85% favourite, and the home team lost
      // — so the favourite won.
      const report = modelAccuracyService.buildAccuracyReport([
        buildHomeLossGame({ homeWinProbability: 0.15 }),
      ]);

      const highBand = report.calibration.find((band) => band.band === "80-90");
      expect(highBand).toEqual({
        band: "80-90",
        meanPredicted: 0.85,
        actualWinRate: 1,
        gamesInBand: 1,
      });
      expect(report.calibration.filter((band) => band.gamesInBand > 0)).toHaveLength(1);
    });

    it.each<[number, string]>([
      [0.5, "50-60"],
      [0.55, "50-60"],
      [0.45, "50-60"],
      [0.6, "60-70"],
      [0.4, "60-70"],
      [0.7, "70-80"],
      [0.79, "70-80"],
      [0.8, "80-90"],
      [0.9, "90-100"],
      [1, "90-100"],
      [0, "90-100"],
    ])("puts a home win probability of %s in the %s band", (homeWinProbability, expectedBand) => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability }),
      ]);

      const occupiedBands = report.calibration.filter((band) => band.gamesInBand > 0);
      expect(occupiedBands.map((band) => band.band)).toEqual([expectedBand]);
    });

    it("averages the predicted probability and the actual favourite win rate within a band", () => {
      // Four games land in 70-80: favourite probabilities 0.7, 0.75, 0.75
      // (the away favourite) and 0.75, a mean of 0.7375. The favourite won
      // three of them — the last game's home favourite lost.
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.7 }),
        buildEvaluatedGame({ homeWinProbability: 0.75 }),
        buildHomeLossGame({ homeWinProbability: 0.25 }),
        buildHomeLossGame({ homeWinProbability: 0.75 }),
      ]);

      const band = report.calibration.find((entry) => entry.band === "70-80");
      expect(band?.gamesInBand).toBe(4);
      expect(band?.meanPredicted).toBe(0.7375);
      expect(band?.actualWinRate).toBe(0.75);
    });

    it("keeps every game in exactly one band, so the bands sum to gamesEvaluated", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeWinProbability: 0.52 }),
        buildEvaluatedGame({ homeWinProbability: 0.68 }),
        buildHomeLossGame({ homeWinProbability: 0.22 }),
        buildHomeLossGame({ homeWinProbability: 0.99 }),
      ]);

      const bandedGameCount = report.calibration.reduce((total, band) => total + band.gamesInBand, 0);
      expect(bandedGameCount).toBe(report.gamesEvaluated);
      expect(bandedGameCount).toBe(4);
    });
  });

  describe("level games", () => {
    it("excludes a game with equal scores, which has no winner to score against", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeScore: 100, awayScore: 100 }),
        buildEvaluatedGame({ homeWinProbability: 0.6 }),
      ]);

      expect(report.gamesEvaluated).toBe(1);
      expect(report.accuracy).toBe(1);
    });

    it("reports an all-level input exactly like an empty one", () => {
      const report = modelAccuracyService.buildAccuracyReport([
        buildEvaluatedGame({ homeScore: 100, awayScore: 100 }),
      ]);

      expect(report).toEqual(modelAccuracyService.buildAccuracyReport([]));
    });
  });
});
