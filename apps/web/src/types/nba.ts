// Which segment of a season a figure or game belongs to. Mirrors the
// SeasonType enum in the API's Prisma schema — the discriminator that keeps
// regular-season and postseason numbers out of each other's views.
export type SeasonType = "REGULAR" | "PLAY_IN" | "PLAYOFFS" | "FINALS";

export interface Team {
  id: string;
  nbaTeamId: number;
  name: string;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  logoUrl: string | null;
}

export interface Player {
  id: string;
  nbaPlayerId: number;
  firstName: string;
  lastName: string;
  position: string;
  heightInches: number | null;
  weightLbs: number | null;
  jerseyNumber: string | null;
  headshotUrl: string | null;
  teamId: string | null;
  team: Team | null;

  // Bio fields from CommonPlayerInfo (see player_bios.py) — null for any
  // player not yet enriched by that ingestion phase, not just genuinely
  // missing data, so callers should render a "—" fallback, not assume null
  // means "this player has no draft history".
  birthDate: string | null;
  school: string | null;
  country: string | null;
  lastAffiliation: string | null;
  seasonExp: number | null;
  rosterStatus: string | null;
  draftYear: number | null;
  draftRound: number | null;
  draftNumber: number | null;
}

export interface SeasonAverages {
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalsMadePerGame: number;
  fieldGoalsAttemptedPerGame: number;
  fieldGoalPercentage: number;
  threesMadePerGame: number;
  threesAttemptedPerGame: number;
  threePointPercentage: number;
  freeThrowsMadePerGame: number;
  freeThrowsAttemptedPerGame: number;
  freeThrowPercentage: number;

  // Derived from the boxscore by the API, like the percentages above.
  trueShootingPercentage: number;
  effectiveFieldGoalPercentage: number;

  // Null when undefined rather than zero — a player with no turnovers has
  // an undefined ratio, not the worst possible one. Render as "—".
  assistToTurnoverRatio: number | null;

  // Null when no game in this segment carries the figure: either the rows
  // predate the columns or the advanced boxscore was unavailable. A zero
  // would be a real measurement (an even plus/minus, 0% usage), so these
  // must render as "—" rather than 0.
  plusMinusPerGame: number | null;
  usagePercentage: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
}

// One player's identity plus their season line — the unit GET
// /v1/players/compare returns, one per player in the comparison.
export interface PlayerComparisonEntry {
  player: Player;
  seasonAverages: SeasonAverages;
}

export interface PlayerComparisonResponse {
  seasonType: SeasonType;
  players: PlayerComparisonEntry[];
}

export interface GameLogEntry {
  gameId: string;
  gameDate: string;
  points: number;
}

export interface PlayerStatsResponse {
  playerId: string;
  // The segment these figures were derived from, echoed back by the API so
  // a caller can't label an already-rendered chart with the wrong segment.
  seasonType: SeasonType;
  seasonAverages: SeasonAverages;
  gameLog: GameLogEntry[];
}

// Every segment's season line at once, from GET /v1/players/:id/stats/splits.
// A segment the player didn't appear in is present with gamesPlayed: 0
// rather than missing, so the comparison table renders a stable set of
// columns.
export type PlayerSeasonSplits = Record<SeasonType, SeasonAverages>;

// GET /v1/players/stats-batch's per-player entry — same shape as
// PlayerStatsResponse minus `seasonType`: the batch endpoint always derives
// from the default (regular season) segment and doesn't echo one back, so
// there's nothing here for a caller to mislabel.
export interface PlayerStatsBatchEntry {
  playerId: string;
  seasonAverages: SeasonAverages;
  gameLog: GameLogEntry[];
}

export interface PlayerStatsSplitsResponse {
  playerId: string;
  splits: PlayerSeasonSplits;
}

export interface Game {
  id: string;
  nbaGameId: string;
  gameDate: string;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  seasonType: SeasonType;
  // 1-4 for PLAYOFFS/FINALS games, null for REGULAR and PLAY_IN.
  playoffRound: number | null;
  // Present on list/detail endpoints that join it in (GET /v1/games,
  // GET /v1/games/:id) — undefined, not just null, on any endpoint that
  // doesn't include the relation, so callers can tell "not fetched" apart
  // from "fetched, but this game has no prediction yet".
  prediction?: GamePrediction | null;
}

export interface LineupSlot {
  id: string;
  lineupId: string;
  playerId: string;
  player: Player;
  predictedFantasyPoints: number | null;
  salary: number | null;
}

export interface Lineup {
  id: string;
  totalPredictedPoints: number;
  totalSalary: number;
  budget: number;
  createdAt: string;
  slots: LineupSlot[];
}

// A player's latest prediction looked up on its own, outside an existing
// lineup — used to price up a hypothetical swap into a locally-edited
// lineup. Null fields mean no prediction has been generated for this player.
export interface PlayerPredictionSummary {
  predictedFantasyPoints: number | null;
  salary: number | null;
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PredictedScorer {
  player: Player;
  predictedPoints: number;
  gamesConsidered: number;
}

export interface GameDetail extends Game {
  predictedScorers: PredictedScorer[];
}

export interface GamePrediction {
  id: string;
  gameId: string;
  homeWinProbability: number;
  homeTeamEloPre: number;
  awayTeamEloPre: number;
  predictedMarginHome: number | null;
  marginMethod: "regression" | "heuristic" | null;
  createdAt: string;
}

// ── Model accuracy ────────────────────────────────────────────────────────
// GET /v1/analytics/model-accuracy — public, and deliberately identical for
// every account. Mirrors ModelAccuracyReport in
// apps/api/src/analytics/model-accuracy.service.ts.
//
// Every figure is nullable because "no games to evaluate yet" is a real
// state, not zero: reporting 0% accuracy on an empty database would be a
// lie, so the API returns null and the UI renders a dash.
export interface CalibrationBand {
  /** e.g. "60-70" — the favourite's predicted probability band. */
  band: string;
  meanPredicted: number | null;
  actualWinRate: number | null;
  gamesInBand: number;
}

export interface ModelAccuracyReport {
  accuracy: number | null;
  brierScore: number | null;
  /** What "always pick the home team" scores on the same games. */
  homeBaselineAccuracy: number | null;
  gamesEvaluated: number;
  /** Predictions genuinely made before tip-off (createdAt < gameDate). */
  forwardPredictionCount: number;
  calibration: CalibrationBand[];
}

// ── Beat the Model ────────────────────────────────────────────────────────
// GET /v1/me/challenge/next. Note what is NOT here: homeScore and awayScore.
// The server withholds them until a call has been committed, which is the
// whole mechanic — see apps/api/src/me/picks/pick-serializers.ts.
export interface ChallengeTeam {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  logoUrl: string | null;
}

export interface ChallengePrediction {
  homeWinProbability: number;
  homeTeamEloPre: number;
  awayTeamEloPre: number;
  predictedMarginHome: number | null;
  marginMethod: string | null;
}

export interface ChallengeGame {
  gameId: string;
  nbaGameId: string;
  gameDate: string;
  season: string;
  homeTeam: ChallengeTeam;
  awayTeam: ChallengeTeam;
  prediction: ChallengePrediction;
}

export type PickOutcome = "CORRECT" | "MISSED";

// POST /v1/me/picks — the graded call, with the answer released only now that
// the pick row exists.
export interface GradedPick {
  id: string;
  gameId: string;
  pickedTeamId: string;
  outcome: PickOutcome;
  createdAt: string;
  finalScore: { homeScore: number; awayScore: number; winningTeamId: string };
  model: {
    homeWinProbability: number;
    predictedMarginHome: number | null;
    homeTeamElo: number;
    awayTeamElo: number;
    favoriteTeamId: string;
    outcome: PickOutcome;
  };
}

// GET /v1/me/picks/record — the user against the model on exactly the games
// the user called. That same-subset restriction is what makes it a fair
// head-to-head, unlike the leaderboard's whole-season model row.
export interface PickRecord {
  wins: number;
  losses: number;
  total: number;
  hitRate: number;
  modelWins: number;
  modelLosses: number;
  modelHitRate: number;
}

// ── Leaderboard ───────────────────────────────────────────────────────────
// GET /v1/analytics/leaderboard — public, and the model is a row on it.
export interface LeaderboardEntry {
  rank: number;
  kind: "user" | "model";
  name: string;
  calls: number;
  correct: number;
  hitRate: number;
}

export interface Leaderboard {
  /** How many calls a user needs before they appear at all. */
  minimumCallsRequired: number;
  entries: LeaderboardEntry[];
}

// ── Watchlist ─────────────────────────────────────────────────────────────
// GET /v1/me/watchlist — the signed-in user's followed players with averages
// derived from PlayerGameStat, plus their own scouting note.
export interface WatchlistTeam {
  id: string;
  /** The nba.com id the crest URL is built from — see lib/nbaMedia.ts. */
  nbaTeamId: number;
  name: string;
  city: string;
  abbreviation: string;
  logoUrl: string | null;
}

export interface WatchlistSeasonAverages {
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
}

export interface RecentGamePoints {
  gameId: string;
  gameDate: string;
  points: number;
}

export interface WatchlistEntry {
  player: {
    /** Our own uuid — this is what /players/:id resolves. */
    id: string;
    /** The nba.com id the headshot URL is built from. */
    nbaPlayerId: number;
    firstName: string;
    lastName: string;
    position: string;
    jerseyNumber: string | null;
    headshotUrl: string | null;
    team: WatchlistTeam | null;
  };
  note: string | null;
  followedAt: string;
  seasonAverages: WatchlistSeasonAverages;
  /** Most recent game FIRST — reverse before plotting a left-to-right trend. */
  recentPoints: RecentGamePoints[];
}

/** What a write to the follow graph answers with. */
export interface PlayerFollow {
  playerId: string;
  note: string | null;
  followedAt: string;
}

// A team's current Elo rating, read from its own most recent predicted
// game (upcoming if it has one — the real, live rating — otherwise its
// last completed game's pre-kickoff snapshot). See TeamsService.getEloRatings
// for why there's no dedicated "current rating" column to read instead.
export interface TeamEloRating {
  team: Team;
  elo: number;
  asOfGameId: string;
  asOfGameDate: string;
}
