import type { GamePick, GamePrediction, Team } from "@prisma/client";
import { PickOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { toChallengeGame, toGradedPickResult, type DecidedGame, type GameWithTeams } from "./pick-serializers.js";

const HOME_TEAM_ID = "team-home";
const AWAY_TEAM_ID = "team-away";

function makeTeam(id: string, overrides: Partial<Team> = {}): Team {
  return {
    id,
    nbaTeamId: 1,
    name: "Lakers",
    abbreviation: "LAL",
    city: "Los Angeles",
    conference: "West",
    division: "Pacific",
    logoUrl: null,
    ...overrides,
  };
}

function makeGameWithTeams(): GameWithTeams {
  return {
    id: "game-1",
    nbaGameId: "MOCK-GAME-1",
    gameDate: new Date("2026-01-15"),
    season: "2025-26",
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    homeScore: 118,
    awayScore: 104,
    homeTeam: makeTeam(HOME_TEAM_ID),
    awayTeam: makeTeam(AWAY_TEAM_ID, { nbaTeamId: 2, name: "Celtics", abbreviation: "BOS", city: "Boston" }),
  };
}

function makePrediction(overrides: Partial<GamePrediction> = {}): GamePrediction {
  return {
    id: "prediction-1",
    gameId: "game-1",
    homeWinProbability: 0.63,
    homeTeamEloPre: 1540.2,
    awayTeamEloPre: 1495.8,
    predictedMarginHome: 4.5,
    marginMethod: "heuristic",
    createdAt: new Date("2026-01-14"),
    ...overrides,
  };
}

function makePick(overrides: Partial<GamePick> = {}): GamePick {
  return {
    id: "pick-1",
    userId: "user-1",
    gameId: "game-1",
    pickedTeamId: HOME_TEAM_ID,
    outcome: PickOutcome.CORRECT,
    modelHomeWinProbabilityAtPick: 0.63,
    modelPredictedMarginAtPick: 4.5,
    homeTeamEloAtPick: 1540.2,
    awayTeamEloAtPick: 1495.8,
    createdAt: new Date("2026-01-16"),
    ...overrides,
  };
}

const decidedGame: DecidedGame = {
  homeTeamId: HOME_TEAM_ID,
  awayTeamId: AWAY_TEAM_ID,
  homeScore: 118,
  awayScore: 104,
};

describe("toChallengeGame", () => {
  it("omits the final score entirely — the keys must be absent, not merely empty", () => {
    const challenge = toChallengeGame(makeGameWithTeams(), makePrediction());
    const serialized = JSON.parse(JSON.stringify(challenge));

    expect("homeScore" in serialized).toBe(false);
    expect("awayScore" in serialized).toBe(false);
    expect(JSON.stringify(serialized)).not.toContain("118");
    expect(JSON.stringify(serialized)).not.toContain("104");
  });

  it("does not leak the score through either nested team object", () => {
    const challenge = toChallengeGame(makeGameWithTeams(), makePrediction());

    expect(Object.keys(challenge.homeTeam)).toEqual(["id", "name", "city", "abbreviation", "logoUrl"]);
    expect(Object.keys(challenge.awayTeam)).toEqual(["id", "name", "city", "abbreviation", "logoUrl"]);
  });

  it("identifies the game and both teams so a card can be rendered", () => {
    const challenge = toChallengeGame(makeGameWithTeams(), makePrediction());

    expect(challenge.gameId).toBe("game-1");
    expect(challenge.nbaGameId).toBe("MOCK-GAME-1");
    expect(challenge.season).toBe("2025-26");
    expect(challenge.gameDate).toEqual(new Date("2026-01-15"));
    expect(challenge.homeTeam.abbreviation).toBe("LAL");
    expect(challenge.awayTeam.abbreviation).toBe("BOS");
  });

  it("includes the model's numbers, which are the thing the user is disagreeing with", () => {
    const challenge = toChallengeGame(makeGameWithTeams(), makePrediction());

    expect(challenge.prediction).toEqual({
      homeWinProbability: 0.63,
      homeTeamEloPre: 1540.2,
      awayTeamEloPre: 1495.8,
      predictedMarginHome: 4.5,
      marginMethod: "heuristic",
    });
  });

  it("passes a null predicted margin through, for a game the regression could not fit", () => {
    const challenge = toChallengeGame(
      makeGameWithTeams(),
      makePrediction({ predictedMarginHome: null, marginMethod: null })
    );

    expect(challenge.prediction.predictedMarginHome).toBeNull();
    expect(challenge.prediction.marginMethod).toBeNull();
  });
});

describe("toGradedPickResult", () => {
  it("releases the final score and names the winner", () => {
    const result = toGradedPickResult(makePick(), decidedGame, HOME_TEAM_ID);

    expect(result.finalScore).toEqual({ homeScore: 118, awayScore: 104, winningTeamId: HOME_TEAM_ID });
  });

  it("returns the stored call and its grading", () => {
    const result = toGradedPickResult(makePick({ outcome: PickOutcome.MISSED }), decidedGame, HOME_TEAM_ID);

    expect(result.id).toBe("pick-1");
    expect(result.gameId).toBe("game-1");
    expect(result.pickedTeamId).toBe(HOME_TEAM_ID);
    expect(result.outcome).toBe(PickOutcome.MISSED);
  });

  it("reports the model's snapshot from the pick row, not from GamePrediction", () => {
    const result = toGradedPickResult(
      makePick({
        modelHomeWinProbabilityAtPick: 0.41,
        modelPredictedMarginAtPick: -2.5,
        homeTeamEloAtPick: 1480,
        awayTeamEloAtPick: 1520,
      }),
      decidedGame,
      HOME_TEAM_ID
    );

    expect(result.model.homeWinProbability).toBe(0.41);
    expect(result.model.predictedMarginHome).toBe(-2.5);
    expect(result.model.homeTeamElo).toBe(1480);
    expect(result.model.awayTeamElo).toBe(1520);
  });

  it("grades the model on the same game, so the user can see they beat it", () => {
    // The model gave the home team 41%, so it called the away team; the home
    // team won, so the model MISSED while this user was CORRECT.
    const result = toGradedPickResult(
      makePick({ outcome: PickOutcome.CORRECT, modelHomeWinProbabilityAtPick: 0.41 }),
      decidedGame,
      HOME_TEAM_ID
    );

    expect(result.model.favoriteTeamId).toBe(AWAY_TEAM_ID);
    expect(result.model.outcome).toBe(PickOutcome.MISSED);
    expect(result.outcome).toBe(PickOutcome.CORRECT);
  });
});
