import type { Team } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  chooseOrientationTeamId,
  orientGameToTeam,
  orientModelCall,
  type GameForOrientation,
  type GamePredictionSnapshot,
} from "./game-orientation.js";

const HOME_TEAM_ID = "team-home";
const AWAY_TEAM_ID = "team-away";

function createTeam(id: string, abbreviation: string): Team {
  return {
    id,
    nbaTeamId: id === HOME_TEAM_ID ? 1 : 2,
    name: abbreviation === "LAL" ? "Lakers" : "Celtics",
    abbreviation,
    city: abbreviation === "LAL" ? "Los Angeles" : "Boston",
    conference: "West",
    division: "Pacific",
    logoUrl: null,
  };
}

function createGame(overrides: Partial<GameForOrientation> = {}): GameForOrientation {
  return {
    id: "game-1",
    nbaGameId: "MOCK-GAME-1",
    gameDate: new Date("2026-01-15"),
    season: "2025-26",
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    homeTeam: createTeam(HOME_TEAM_ID, "LAL"),
    awayTeam: createTeam(AWAY_TEAM_ID, "BOS"),
    homeScore: 110,
    awayScore: 105,
    prediction: null,
    ...overrides,
  };
}

function createPrediction(overrides: Partial<GamePredictionSnapshot> = {}): GamePredictionSnapshot {
  return {
    homeWinProbability: 0.58,
    predictedMarginHome: 4.5,
    marginMethod: "heuristic",
    ...overrides,
  };
}

describe("orientGameToTeam", () => {
  // Regression: `won = yourScore > opponentScore` reported a draw as a LOSS,
  // and as a loss for BOTH sides, since each follower reads the game from
  // their own team's side. orientModelCall then graded the model against that
  // invented result.
  it("drops a drawn game rather than calling it a loss for both teams", () => {
    const drawnGame = createGame({ homeScore: 100, awayScore: 100 });

    expect(orientGameToTeam(drawnGame, HOME_TEAM_ID)).toBeNull();
    expect(orientGameToTeam(drawnGame, AWAY_TEAM_ID)).toBeNull();
  });

  it("reads a home win from the home team's side", () => {
    const result = orientGameToTeam(createGame(), HOME_TEAM_ID);

    expect(result).toMatchObject({
      gameId: "game-1",
      yourScore: 110,
      opponentScore: 105,
      won: true,
      playedAtHome: true,
    });
    expect(result?.yourTeam.abbreviation).toBe("LAL");
    expect(result?.opponent.abbreviation).toBe("BOS");
  });

  // The same stored row, the same final score, told from the other bench: the
  // scores swap and the result inverts. This is the whole point of the module.
  it("reads the same game as a loss from the away team's side", () => {
    const result = orientGameToTeam(createGame(), AWAY_TEAM_ID);

    expect(result).toMatchObject({
      yourScore: 105,
      opponentScore: 110,
      won: false,
      playedAtHome: false,
    });
    expect(result?.yourTeam.abbreviation).toBe("BOS");
    expect(result?.opponent.abbreviation).toBe("LAL");
  });

  it("returns null for a game the given team did not play in", () => {
    expect(orientGameToTeam(createGame(), "team-uninvolved")).toBeNull();
  });

  const incompleteScoreCases: Array<[string, Partial<GameForOrientation>]> = [
    ["home score", { homeScore: null }],
    ["away score", { awayScore: null }],
    ["both scores", { homeScore: null, awayScore: null }],
  ];

  it.each(incompleteScoreCases)("returns null when the game has no final %s", (_label, scoreOverrides) => {
    expect(orientGameToTeam(createGame(scoreOverrides), HOME_TEAM_ID)).toBeNull();
  });

  it("carries the team crest fields through for both sides", () => {
    const result = orientGameToTeam(createGame(), HOME_TEAM_ID);

    expect(result?.yourTeam).toEqual({
      id: HOME_TEAM_ID,
      // The nba.com id travels with the crest fields: the frontend builds the
      // logo URL from it rather than from our uuid.
      nbaTeamId: 1,
      name: "Lakers",
      city: "Los Angeles",
      abbreviation: "LAL",
      logoUrl: null,
    });
  });

  it("reports no model call for a game that was never predicted", () => {
    expect(orientGameToTeam(createGame({ prediction: null }), HOME_TEAM_ID)?.modelCall).toBeNull();
  });
});

describe("orientModelCall", () => {
  it("leaves a home-team probability alone when your team was home", () => {
    const modelCall = orientModelCall(createPrediction({ homeWinProbability: 0.58 }), true, true);

    expect(modelCall).toMatchObject({
      predictedWinner: "YOUR_TEAM",
      yourTeamWinProbability: 0.58,
      predictedMarginInPoints: 4.5,
      marginMethod: "heuristic",
      wasCorrect: true,
    });
  });

  // 1 - 0.58 is 0.42000000000000004 in binary floating point; a win
  // probability that arrives at the frontend with a fifteen-digit tail is a
  // rendering bug waiting to happen.
  it("flips the probability for an away team without floating-point dust", () => {
    const modelCall = orientModelCall(createPrediction({ homeWinProbability: 0.58 }), false, false);

    expect(modelCall?.yourTeamWinProbability).toBe(0.42);
    expect(modelCall?.predictedWinner).toBe("OPPONENT");
  });

  it("negates the predicted margin for an away team", () => {
    const modelCall = orientModelCall(createPrediction({ predictedMarginHome: 4.5 }), false, false);

    expect(modelCall?.predictedMarginInPoints).toBe(-4.5);
  });

  // GamePrediction.predictedMarginHome is null when neither team had enough
  // completed games for the Four Factors model. That stays null - there is no
  // number to orient, and inventing one would be a fabricated statistic.
  it("keeps a missing predicted margin missing", () => {
    const modelCall = orientModelCall(
      createPrediction({ predictedMarginHome: null, marginMethod: null }),
      true,
      true
    );

    expect(modelCall?.predictedMarginInPoints).toBeNull();
    expect(modelCall?.marginMethod).toBeNull();
    expect(modelCall?.yourTeamWinProbability).toBe(0.58);
  });

  it("picks nobody, and scores nothing, on an exact coin flip", () => {
    const modelCall = orientModelCall(createPrediction({ homeWinProbability: 0.5 }), true, true);

    expect(modelCall?.predictedWinner).toBeNull();
    expect(modelCall?.wasCorrect).toBeNull();
  });

  // [description, stored home win probability, your team was home, your team
  // won, the call should be scored correct]
  const scoringCases: Array<[string, number, boolean, boolean, boolean]> = [
    ["called your win and you won", 0.7, true, true, true],
    ["called your win and you lost", 0.7, true, false, false],
    ["called the opponent and they won", 0.7, false, false, true],
    ["called the opponent and you won", 0.7, false, true, false],
  ];

  it.each(scoringCases)(
    "scores the call correctly when it %s",
    (_label, homeWinProbability, yourTeamIsHome, yourTeamWon, expectedWasCorrect) => {
      const modelCall = orientModelCall(
        createPrediction({ homeWinProbability }),
        yourTeamIsHome,
        yourTeamWon
      );

      expect(modelCall?.wasCorrect).toBe(expectedWasCorrect);
    }
  );

  it("returns null when there is no prediction to orient", () => {
    expect(orientModelCall(null, true, true)).toBeNull();
  });
});

describe("chooseOrientationTeamId", () => {
  const game = { homeTeamId: HOME_TEAM_ID, awayTeamId: AWAY_TEAM_ID };

  it("picks the followed team when only one side is followed", () => {
    expect(chooseOrientationTeamId(new Set([HOME_TEAM_ID]), null, game)).toBe(HOME_TEAM_ID);
    expect(chooseOrientationTeamId(new Set([AWAY_TEAM_ID]), null, game)).toBe(AWAY_TEAM_ID);
  });

  // A user who follows both teams sees the game once, not twice. Their primary
  // team decides whose side it is told from.
  it("prefers the primary team when both sides are followed", () => {
    const bothFollowed = new Set([HOME_TEAM_ID, AWAY_TEAM_ID]);

    expect(chooseOrientationTeamId(bothFollowed, AWAY_TEAM_ID, game)).toBe(AWAY_TEAM_ID);
    expect(chooseOrientationTeamId(bothFollowed, HOME_TEAM_ID, game)).toBe(HOME_TEAM_ID);
  });

  it("falls back to the home team when both sides are followed and neither is primary", () => {
    expect(chooseOrientationTeamId(new Set([HOME_TEAM_ID, AWAY_TEAM_ID]), null, game)).toBe(HOME_TEAM_ID);
    expect(chooseOrientationTeamId(new Set([HOME_TEAM_ID, AWAY_TEAM_ID]), "team-elsewhere", game)).toBe(
      HOME_TEAM_ID
    );
  });

  it("returns null for a game with no followed team in it", () => {
    expect(chooseOrientationTeamId(new Set(["team-elsewhere"]), null, game)).toBeNull();
    expect(chooseOrientationTeamId(new Set(), null, game)).toBeNull();
  });
});
