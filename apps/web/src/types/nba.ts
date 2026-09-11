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

// GET /v1/players/stats-batch's per-player entry — same shape as
// PlayerStatsResponse minus `seasonType`: the batch endpoint always derives
// from the default (regular season) segment and doesn't echo one back, so
// there's nothing here for a caller to mislabel.
export interface PlayerStatsBatchEntry {
  playerId: string;
  seasonAverages: SeasonAverages;
  gameLog: GameLogEntry[];
}

// Every segment's season line at once, from GET /v1/players/:id/stats/splits.
// A segment the player didn't appear in is present with gamesPlayed: 0
// rather than missing, so the comparison table renders a stable set of
// columns.
export type PlayerSeasonSplits = Record<SeasonType, SeasonAverages>;

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

// GET /v1/me's full response — the current user's personalization state.
// avatarUrl is already a signed, directly-renderable URL (the API never
// exposes the underlying private Supabase Storage object path) — see
// MeService.getProfile. username: null is the onboarding gate signal (see
// useMe/ProfileGate): a signed-in user with no username hasn't completed
// onboarding yet.
export interface MeProfile {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  favoriteTeam: Team | null;
  followedPlayers: Player[];
}

// GET /v1/teams/:id/suggested-players' per-player entry — a team's roster
// ranked by usage percentage, for the onboarding step's "suggested players
// to follow" prompt. null usagePercentage means no stats exist yet for that
// player (see TeamsService.getSuggestedPlayers), not a zero rate.
export interface SuggestedPlayer {
  player: Player;
  usagePercentage: number | null;
}
