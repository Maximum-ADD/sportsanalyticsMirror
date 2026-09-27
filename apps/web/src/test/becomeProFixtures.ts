// Typed fixtures for Become Pro.
//
// A compile-time contract pin as much as a convenience: each one is annotated
// with the real response type, so if the backend's shape drifts from
// src/types/nba.ts, `tsc -b` fails here before any test runs.

import type {
  MyBecomePro,
  MyBecomeProSummary,
  Player,
  ProspectComparable,
  ProspectGame,
  ProspectGameInput,
  ProspectSeason,
  ProspectValuation,
  SeasonAverages,
} from "@/types/nba";

export function makeProspectGameInput(overrides: Partial<ProspectGameInput> = {}): ProspectGameInput {
  return {
    gameDate: "2026-01-15",
    opponent: "Lincoln High",
    minutes: 32,
    points: 24,
    rebounds: 7,
    assists: 5,
    steals: 2,
    blocks: 1,
    turnovers: 3,
    fieldGoalsMade: 9,
    fieldGoalsAttempted: 17,
    threesMade: 3,
    threesAttempted: 7,
    freeThrowsMade: 3,
    freeThrowsAttempted: 4,
    ...overrides,
  };
}

export function makeProspectGame(overrides: Partial<ProspectGame> = {}): ProspectGame {
  return { ...makeProspectGameInput(), id: "game-1", seasonId: "season-1", ...overrides };
}

export function makeProspectSeason(overrides: Partial<ProspectSeason> = {}): ProspectSeason {
  return {
    id: "season-1",
    season: "2025-26",
    competitionLevel: "NCAA_D2",
    position: "G",
    teamName: "Riverside College",
    gamesLogged: 14,
    createdAt: "2026-01-02T10:00:00.000Z",
    updatedAt: "2026-02-01T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * The season line the API derives for fourteen of the default game above:
 * 24 points on 9-for-17, 3-for-7 from three and 3-for-4 at the line.
 */
export function makeSeasonAverages(overrides: Partial<SeasonAverages> = {}): SeasonAverages {
  return {
    gamesPlayed: 14,
    minutesPerGame: 32,
    pointsPerGame: 24,
    reboundsPerGame: 7,
    assistsPerGame: 5,
    stealsPerGame: 2,
    blocksPerGame: 1,
    turnoversPerGame: 3,
    fieldGoalsMadePerGame: 9,
    fieldGoalsAttemptedPerGame: 17,
    fieldGoalPercentage: 52.9,
    threesMadePerGame: 3,
    threesAttemptedPerGame: 7,
    threePointPercentage: 42.9,
    freeThrowsMadePerGame: 3,
    freeThrowsAttemptedPerGame: 4,
    freeThrowPercentage: 75,
    trueShootingPercentage: 64,
    effectiveFieldGoalPercentage: 61.8,
    assistToTurnoverRatio: 1.67,
    plusMinusPerGame: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nbaPlayerId: 1642000,
    firstName: "Real",
    lastName: "Rookie",
    position: "G",
    heightInches: 76,
    weightLbs: 200,
    jerseyNumber: "7",
    headshotUrl: null,
    teamId: null,
    team: null,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: 2024,
    draftRound: 1,
    draftNumber: 18,
    ...overrides,
  };
}

export function makeComparable(overrides: Partial<ProspectComparable> = {}): ProspectComparable {
  return {
    player: makePlayer(),
    seasonAverages: makeSeasonAverages({ gamesPlayed: 62, pointsPerGame: 11.4 }),
    rookieSeason: "2024-25",
    similarity: 0.87,
    ...overrides,
  };
}

export function makeProspectValuation(overrides: Partial<ProspectValuation> = {}): ProspectValuation {
  return {
    seasonId: "season-1",
    projectedDraftSlot: 18,
    projectedValueUsd: 3_520_000,
    projectedValueLowUsd: 2_530_000,
    projectedValueHighUsd: 4_500_000,
    rookieScaleYear: "2025-26",
    levelFactor: 0.62,
    levelFactorBasis: "NCAA Division II production is translated against Division I output.",
    modelVersion: "prospect-value-2.0.0",
    computedAt: "2026-02-01T12:00:00.000Z",
    drivers: [
      { label: "Scoring", detail: "24.0 points per game, counted as 14.9 after the level adjustment." },
      { label: "Efficiency", detail: "64.0% true shooting on that scoring volume." },
    ],
    levelAdjustedAverages: makeSeasonAverages({ pointsPerGame: 14.9 }),
    comparables: [],
    slotAlumni: [],
    ...overrides,
  };
}

export function makeMyBecomePro(overrides: Partial<MyBecomePro> = {}): MyBecomePro {
  return {
    seasons: [makeProspectSeason()],
    activeSeasonId: "season-1",
    seasonAverages: makeSeasonAverages(),
    gameLog: [{ gameId: "game-1", gameDate: "2026-01-15", points: 24, season: "2025-26" }],
    games: [makeProspectGame()],
    valuationState: "VALUED",
    valuation: makeProspectValuation(),
    valueHistory: [
      { computedAt: "2026-01-20T12:00:00.000Z", valueUsd: 3_190_000 },
      { computedAt: "2026-02-01T12:00:00.000Z", valueUsd: 3_520_000 },
    ],
    minimumGamesRequired: 10,
    ...overrides,
  };
}

/** A user who has not started a season: the page's empty state. */
export function makeEmptyBecomePro(): MyBecomePro {
  return {
    seasons: [],
    activeSeasonId: null,
    seasonAverages: null,
    gameLog: [],
    games: [],
    valuationState: null,
    valuation: null,
    valueHistory: [],
    minimumGamesRequired: 10,
  };
}

export function makeMyBecomeProSummary(overrides: Partial<MyBecomeProSummary> = {}): MyBecomeProSummary {
  return {
    season: "2025-26",
    competitionLevel: "NCAA_D2",
    gamesLogged: 14,
    valuationState: "VALUED",
    projectedDraftSlot: 18,
    projectedValueUsd: 3_520_000,
    valueHistory: [
      { computedAt: "2026-01-20T12:00:00.000Z", valueUsd: 3_190_000 },
      { computedAt: "2026-02-01T12:00:00.000Z", valueUsd: 3_520_000 },
    ],
    minimumGamesRequired: 10,
    ...overrides,
  };
}
