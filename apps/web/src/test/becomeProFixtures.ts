// Typed fixtures for the Become Pro feature.
//
// These exist to be a compile-time contract pin as much as a convenience: each
// one is annotated with the real response type, so if the backend's shape
// drifts from src/types/nba.ts, `tsc -b` fails here before any test runs. That
// is the whole reason the frontend can be built and merged while the API is
// still unwritten.

import type {
  ProspectEvidence,
  ProspectGame,
  ProspectGameInput,
  ProspectLeaderboard,
  ProspectLeaderboardEntry,
  ProspectProfile,
  ProspectRankSummary,
  ProspectReliability,
  ProspectSeason,
  ProspectValuation,
  SeasonAverages,
} from "@/types/nba";
import { deriveSeasonAverages } from "@/lib/prospectValue";

export function makeProspectGameInput(
  overrides: Partial<ProspectGameInput> = {}
): ProspectGameInput {
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
  return {
    ...makeProspectGameInput(),
    id: "game-1",
    seasonId: "season-1",
    evidenceId: null,
    evidenceStatus: null,
    ...overrides,
  };
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

export function makeProspectEvidence(
  overrides: Partial<ProspectEvidence> = {}
): ProspectEvidence {
  return {
    id: "evidence-1",
    seasonId: "season-1",
    fileName: "scoresheet-jan.pdf",
    fileUrl: "https://storage.example/signed/scoresheet-jan.pdf",
    mimeType: "application/pdf",
    status: "PENDING",
    reviewedAt: null,
    reviewNote: null,
    gamesCovered: 4,
    uploadedAt: "2026-02-01T10:00:00.000Z",
    ...overrides,
  };
}

export function makeProspectReliability(
  overrides: Partial<ProspectReliability> = {}
): ProspectReliability {
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

export function makeProspectValuation(
  overrides: Partial<ProspectValuation> = {}
): ProspectValuation {
  return {
    seasonId: "season-1",
    basis: "LOGGED",
    projectedDraftSlot: 18,
    projectedValueUsd: 4_368_000,
    projectedValueLowUsd: 3_100_000,
    projectedValueHighUsd: 5_900_000,
    rookieScaleYear: "2025-26",
    levelFactor: 0.62,
    levelFactorBasis: "NCAA Division II scoring translated against D1 rookie production.",
    modelVersion: "prospect-value-1.0.0",
    computedAt: "2026-02-01T12:00:00.000Z",
    drivers: [
      { label: "Scoring volume", detail: "24.1 points per game is top-decile for this level." },
      { label: "Efficiency", detail: "58.2% true shooting holds up after the level adjustment." },
    ],
    minimumGamesRequired: 10,
    comparables: [],
    slotAlumni: [],
    ...overrides,
  };
}

/** The derived line for the default 14-game fixture season. */
export function makeProspectSeasonAverages(): SeasonAverages {
  return deriveSeasonAverages(Array.from({ length: 14 }, () => makeProspectGameInput()));
}

export function makeProspectProfile(overrides: Partial<ProspectProfile> = {}): ProspectProfile {
  return {
    username: "kiran",
    displayName: "Kiran",
    avatarUrl: null,
    isSelf: true,
    rank: 12,
    rankState: "RANKED",
    seasons: [makeProspectSeason()],
    activeSeasonId: "season-1",
    seasonAverages: makeProspectSeasonAverages(),
    gameLog: [{ gameId: "game-1", gameDate: "2026-01-15", points: 24, season: "2025-26" }],
    games: [makeProspectGame()],
    evidence: [makeProspectEvidence()],
    reliability: makeProspectReliability(),
    valuation: makeProspectValuation(),
    ...overrides,
  };
}

export function makeProspectLeaderboardEntry(
  overrides: Partial<ProspectLeaderboardEntry> = {}
): ProspectLeaderboardEntry {
  return {
    rank: 1,
    username: "kiran",
    displayName: "Kiran",
    avatarUrl: null,
    competitionLevel: "NCAA_D2",
    gamesLogged: 14,
    pointsPerGame: 24.1,
    projectedDraftSlot: 18,
    projectedValueUsd: 4_368_000,
    reliabilityTier: "PARTIAL",
    isSelf: false,
    ...overrides,
  };
}

export function makeProspectLeaderboard(
  overrides: Partial<ProspectLeaderboard> = {}
): ProspectLeaderboard {
  return {
    data: [makeProspectLeaderboardEntry()],
    page: 1,
    pageSize: 25,
    total: 1,
    minimumGamesRequired: 10,
    rookieScaleYear: "2025-26",
    references: [
      { label: "Pick 1", draftSlot: 1, valueUsd: 12_500_000 },
      { label: "Pick 30", draftSlot: 30, valueUsd: 2_800_000 },
    ],
    yourStanding: null,
    ...overrides,
  };
}

export function makeProspectRankSummary(
  overrides: Partial<ProspectRankSummary> = {}
): ProspectRankSummary {
  return {
    rank: 12,
    rankState: "RANKED",
    username: "kiran",
    projectedValueUsd: 4_368_000,
    gamesLogged: 14,
    minimumGamesRequired: 10,
    valueHistory: [
      { computedAt: "2026-01-20T12:00:00.000Z", valueUsd: 3_900_000 },
      { computedAt: "2026-02-01T12:00:00.000Z", valueUsd: 4_368_000 },
    ],
    ...overrides,
  };
}
