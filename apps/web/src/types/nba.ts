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
  // League year the game belongs to (e.g. "2025-26") — lets a caller chart
  // one season at a time from a log that spans several.
  season: string;
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

// One category's season leader from GET /v1/players/leaders — the player
// with the highest figure in a headline category after the participation
// floor. `value` is the category figure itself: a TS% leader carries a
// percentage (0-100), not a ratio.
export interface PlayerSeasonLeader {
  player: Player;
  value: number;
  gamesPlayed: number;
}

// GET /v1/players/leaders' response — the four figures behind the players
// page's "League leaders" band. A category with no qualified player is null
// rather than a zeroed entry: "nobody has played enough to lead" is true
// absence, and rendering it as 0.0 would be a lie about the leader.
export interface PlayerLeadersResponse {
  seasonType: SeasonType;
  minGames: number;
  leaders: {
    ppg: PlayerSeasonLeader | null;
    rpg: PlayerSeasonLeader | null;
    apg: PlayerSeasonLeader | null;
    tsPct: PlayerSeasonLeader | null;
  };
}

// The ranking keys GET /v1/players accepts for `sort` — which season stat
// the leaderboard orders by. "name" is the client-side label for omitting
// the param entirely (the API's alphabetical default), so it's not a value
// the API ever receives.
export type PlayerStatSort = "ppg" | "rpg" | "apg" | "ts";

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
  // Same undefined-vs-null distinction as prediction above. Written by
  // apps/ingestion/fetch_market_odds.py, independently of prediction —
  // null means either this game hasn't been matched to an odds-API event
  // yet, or (once played) never was, not that fetching failed.
  marketOdds?: GameMarketOdds | null;
}

// GET /v1/games and GET /v1/games/:id's joined market-odds snapshot — see
// GameMarketOdds's Prisma schema doc comment for the de-vig/free-tier
// details this type doesn't repeat.
export interface GameMarketOdds {
  id: string;
  gameId: string;
  homeWinProbability: number;
  bookmakerCount: number;
  source: string;
  fetchedAt: string;
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

// GET /v1/optimizer/predictions — the latest prediction for every player in
// one list, player (with team) embedded. The optimizer page's edit mode
// ranks these by dollars-per-point to suggest value adds that fit the
// board's remaining budget.
export interface PlayerPredictionListItem {
  playerId: string;
  predictedFantasyPoints: number;
  salary: number;
  asOf: string;
  player: Player;
}

// GET/POST /v1/me/lineups — a lineup the user saved from the optimizer
// board. Slots freeze the numbers the board showed at save time
// (PlayerPrediction is append-and-take-latest, so a live lookup would
// silently rewrite what the user saved); the current* fields are the
// player's latest prediction at read time, and drift is derived from the
// two. Null current fields (and null drift) mean a player has no
// prediction on record at all.
export interface SavedLineupSlot {
  id: string;
  playerId: string;
  player: Player;
  predictedPointsAtSave: number;
  salaryAtSave: number;
  currentPredictedFantasyPoints: number | null;
  currentSalary: number | null;
}

export interface SavedLineupDrift {
  pointsDelta: number;
  salaryDelta: number;
  isOverBudget: boolean;
}

export interface SavedLineup {
  id: string;
  budget: number;
  // Every lineup gets a name on save — the API rejects a missing or blank
  // one — so a shelf of saves stays tell-apart-able.
  name: string;
  createdAt: string;
  totalPredictedPointsAtSave: number;
  totalSalaryAtSave: number;
  drift: SavedLineupDrift | null;
  slots: SavedLineupSlot[];
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
  followedAt: string;
  seasonAverages: WatchlistSeasonAverages;
  /** Most recent game FIRST — reverse before plotting a left-to-right trend. */
  recentPoints: RecentGamePoints[];
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

// GET /v1/teams/records' per-team entry — win/loss record and recent form
// derived from completed games. winPercentage is null for a team with no
// completed games yet. recentForm is oldest-to-newest left-to-right, capped
// at 5 games — see TeamsService.getTeamRecords.
export interface TeamRecord {
  teamId: string;
  wins: number;
  losses: number;
  winPercentage: number | null;
  recentForm: ("W" | "L")[];
}

// Mirrors the Prisma Role enum (apps/api/prisma/schema.prisma) — kept as a
// plain union rather than imported, the same way SeasonType's values are
// hand-mirrored elsewhere in this file, since the frontend has no direct
// dependency on the Prisma client.
export type UserRole = "PUBLIC" | "USER" | "ANALYST" | "ADMIN";

// GET /v1/me's full response — the current user's personalization state.
// avatarUrl is already a signed, directly-renderable URL (the API never
// exposes the underlying private Supabase Storage object path) — see
// MeService.getProfile. username: null is the onboarding gate signal (see
// useMe/ProfileGate): a signed-in user with no username hasn't completed
// onboarding yet. role gates the admin page (see AdminGate) — re-read fresh
// from Postgres on every GET /v1/me, not trusted from the BetterAuth session
// object directly.
export interface MeProfile {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  favoriteTeam: Team | null;
  followedPlayers: Player[];
  role: UserRole;
}

// GET /v1/admin/users' per-row shape — deliberately narrower than the full
// User model (no session tokens, no favoriteTeamId, etc.), matching exactly
// what AdminUsersService selects.
export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  username: string | null;
  role: UserRole;
  createdAt: string;
}

// GET /v1/teams/:id/suggested-players' per-player entry — a team's roster
// ranked by usage percentage, for the onboarding step's "suggested players
// to follow" prompt. null usagePercentage means no stats exist yet for that
// player (see TeamsService.getSuggestedPlayers), not a zero rate.
export interface SuggestedPlayer {
  player: Player;
  usagePercentage: number | null;
}

// The slim team identity matchup rows carry — the same three fields the
// API's OpponentTeamSummary exposes, nothing more.
export interface TeamSummary {
  id: string;
  name: string;
  abbreviation: string;
}

// GET /v1/players/:id/matchup-projection's per-opponent row: how one player
// has scored against one opponent over their full ingested history in the
// segment.
export interface OpponentSplitEntry {
  opponent: TeamSummary;
  gamesPlayed: number;
  pointsPerGame: number;
}

// One still-unplayed game on the player's team schedule with the
// opponent-adjusted scoring projection attached — one chart point per
// upcoming game on the profile's projected trend view.
export interface UpcomingGameProjection {
  gameId: string;
  gameDate: string;
  opponent: TeamSummary;
  isHome: boolean;
  projectedPoints: number;
}

// GET /v1/players/:id/matchup-projection — the matchup-analysis payload.
// Each upcoming projection blends the player's overall rate with their
// opponent-specific one, trusting the split more as the sample grows (see
// StatsService.projectPointsAgainstOpponent).
export interface PlayerMatchupProjection {
  playerId: string;
  seasonType: SeasonType;
  overallPointsPerGame: number;
  splits: OpponentSplitEntry[];
  upcomingGames: UpcomingGameProjection[];
}

// ── Your team's results ───────────────────────────────────────────────────
// GET /v1/me/teams/results — recent completed games for the team the user
// supports, retold from THEIR side rather than the home team's. That
// reorientation is the whole point of the route: /v1/games can list the same
// games, but only as home-vs-away.
export type PredictedWinner = "YOUR_TEAM" | "OPPONENT";

export interface OrientedModelCall {
  /** Null only when the model split the game exactly evenly and picked nobody. */
  predictedWinner: PredictedWinner | null;
  yourTeamWinProbability: number;
  /** Positive means the model expected your team to win by this much. Null when
   *  the Four Factors margin could not be computed — not substituted with a guess. */
  predictedMarginInPoints: number | null;
  marginMethod: string | null;
  /** Null when the model picked nobody, which cannot be scored either way. */
  wasCorrect: boolean | null;
}

export interface TeamResult {
  gameId: string;
  nbaGameId: string;
  gameDate: string;
  season: string;
  yourTeam: WatchlistTeam;
  opponent: WatchlistTeam;
  yourScore: number;
  opponentScore: number;
  won: boolean;
  playedAtHome: boolean;
  /** Null when predict_games.py never wrote a prediction for this game. */
  modelCall: OrientedModelCall | null;
}

export interface TeamResultsFeed {
  data: TeamResult[];
}

// ── Saved shelf ───────────────────────────────────────────────────────────
// GET /v1/me/saved/comparisons and /v1/me/saved/lineups.
export interface SavedComparisonPlayer {
  playerId: string;
  position: number;
  player: Player;
}

export interface SavedComparison {
  id: string;
  name: string;
  createdAt: string;
  players: SavedComparisonPlayer[];
}

// Saved LINEUPS are declared further up this file, against GET /v1/me/lineups.
// There is deliberately no second declaration here: an earlier version of the
// shelf had one, pointing at a /v1/me/saved/lineups route that no longer
// exists, and TypeScript merged the two interfaces into a shape neither the
// API nor the profile page could satisfy.

// ── Become Pro ────────────────────────────────────────────────────────────
// A user's own season: self-reported, per-game box scores. The season line is
// DERIVED from those rows and never typed directly, so every published
// prospect figure traces back to a game record exactly as every NBA figure in
// this file does (see the README's opening paragraph).
//
// The derived line is `SeasonAverages` VERBATIM — the same type the NBA
// endpoints return. That is what lets StatTile, PlayerTraitsRadar,
// ComparisonTraitsRadar, PointsTrendChart and the formatters in
// lib/advancedStats.ts carry this feature with no new chart or table code.

/**
 * Where a season was played. Required on every season, because it scales the
 * valuation: without it the board would rank whoever plays the weakest
 * opposition rather than whoever is the best prospect.
 */
export type CompetitionLevel =
  | "NCAA_D1"
  | "NCAA_D2"
  | "NCAA_D3"
  | "NAIA"
  | "JUCO"
  | "INTERNATIONAL_PRO"
  | "SEMI_PRO"
  | "HIGH_SCHOOL"
  | "REC";

export interface ProspectSeason {
  id: string;
  /** League year, e.g. "2025-26" — the same format Game.season carries. */
  season: string;
  competitionLevel: CompetitionLevel;
  position: string;
  teamName: string | null;
  gamesLogged: number;
  createdAt: string;
  updatedAt: string;
}

/** The body of a single logged game — what the entry form posts. */
export interface ProspectGameInput {
  /** ISO date. The API rejects a future date. */
  gameDate: string;
  opponent: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threesMade: number;
  threesAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
}

export interface ProspectGame extends ProspectGameInput {
  id: string;
  seasonId: string;
  // Which uploaded document covers this game. null means self-reported with
  // nothing behind it — a real state that must render as such, not as a gap.
  evidenceId: string | null;
  // Denormalised from that document so a game row can show its own standing
  // without the caller joining the evidence list itself.
  evidenceStatus: EvidenceStatus | null;
}

export interface CreateProspectSeasonBody {
  season: string;
  competitionLevel: CompetitionLevel;
  position: string;
  teamName?: string | null;
}

export type EvidenceStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface ProspectEvidence {
  id: string;
  seasonId: string;
  fileName: string;
  // Signed, directly renderable URL — the API never exposes the underlying
  // private storage path, exactly as MeProfile.avatarUrl already works.
  // NULL for anyone who is not the owner or an admin: a scorecard carries
  // other people's names, so the public gets the status and never the file.
  fileUrl: string | null;
  mimeType: string;
  status: EvidenceStatus;
  reviewedAt: string | null;
  /** Shown verbatim when REJECTED, so a rejection is never unexplained. */
  reviewNote: string | null;
  gamesCovered: number;
  uploadedAt: string;
}

/** GET /v1/admin/become-pro/evidence's row — the review queue needs an owner. */
export interface AdminProspectEvidence extends ProspectEvidence {
  owner: { username: string; displayName: string };
}

/**
 * The "reliability score": how much of a season's line is backed by uploaded,
 * admin-verified documents.
 *
 * Deliberately named apart from lib/reliability.ts, which already means
 * PREDICTION reliability (how close a player's last N games landed to today's
 * predicted points). The two are unrelated and must not share a vocabulary.
 */
export interface ProspectReliability {
  gamesLogged: number;
  gamesVerified: number;
  gamesDocumented: number;
  /** 0-1, share of logged games covered by VERIFIED evidence. */
  verifiedCoverage: number;
  /** 0-1, share covered by evidence of any status. */
  documentedCoverage: number;
  // Computed server-side so the tier boundaries cannot drift between the
  // valuation model and this UI.
  tier: ProspectReliabilityTier;
  // NULL only when gamesLogged === 0. With games on record a score of 0 is a
  // REAL measurement (nothing documented yet) and renders as 0, never "—".
  score: number | null;
}

export type ProspectReliabilityTier = "UNDOCUMENTED" | "PARTIAL" | "STRONG";

export interface ProspectComparable {
  player: Player;
  seasonAverages: SeasonAverages;
  /** 0-1, the model's own distance metric — not a claim of equivalence. */
  similarity: number;
}

// Real players actually drafted at the projected slot, built from
// Player.draftYear/draftRound/draftNumber which this repo already carries.
// Turns an abstract dollar figure into "Pick 24 — a real name, a real year".
export interface DraftSlotAlumnus {
  player: Player;
  draftYear: number;
}

export interface ProspectValuation {
  /** Echoed so an already-rendered figure cannot be mislabelled. */
  seasonId: string;
  // HYPOTHETICAL is reserved for the deferred what-if preview; everything
  // persisted is LOGGED. The discriminator exists so a figure no model
  // produced could never be presented as one that was.
  basis: "LOGGED" | "HYPOTHETICAL";
  // NULL — never 0 — when the games floor is unmet. The UI renders the
  // shortfall sentence instead of a figure.
  projectedDraftSlot: number | null;
  /** Whole USD, first-year rookie scale. */
  projectedValueUsd: number | null;
  // An honest interval, widened by a short game log and thin evidence.
  projectedValueLowUsd: number | null;
  projectedValueHighUsd: number | null;
  /** Which published scale this figure came from, e.g. "2025-26". */
  rookieScaleYear: string;
  levelFactor: number;
  /** One sentence naming where that factor comes from. */
  levelFactorBasis: string;
  modelVersion: string;
  // Null when the model has never run for this season. The payload still
  // carries a valuation OBJECT in that case — with null figures — so the
  // client renders one shape and reads the nulls as "not valued yet" rather
  // than branching on a missing key.
  computedAt: string | null;
  // SERVER-AUTHORED. The client renders these verbatim and never composes
  // one — a client-written explanation of a server-side model is invention.
  drivers: ProspectValuationDriver[];
  minimumGamesRequired: number;
  comparables: ProspectComparable[];
  slotAlumni: DraftSlotAlumnus[];
}

export interface ProspectValuationDriver {
  label: string;
  detail: string;
}

/**
 * Why a prospect has no rank. Carried so the UI never shows a dead "unranked"
 * chip with no explanation — absence always arrives with its reason.
 */
export type ProspectRankState =
  | "RANKED"
  | "BELOW_GAMES_FLOOR"
  | "AWAITING_VALUATION"
  | "HIDDEN";

export interface ProspectProfile {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** True when the signed-in caller owns this profile — gates every write. */
  isSelf: boolean;
  rank: number | null;
  rankState: ProspectRankState;
  seasons: ProspectSeason[];
  activeSeasonId: string;
  /** DERIVED server-side from `games`; authoritative over any client preview. */
  seasonAverages: SeasonAverages;
  /** Reuses the existing type verbatim so PointsTrendChart needs no change. */
  gameLog: GameLogEntry[];
  games: ProspectGame[];
  evidence: ProspectEvidence[];
  reliability: ProspectReliability;
  valuation: ProspectValuation;
}

// GET /v1/become-pro/prospects — everyone with a public season, ranked or
// not. Separate from the leaderboard on purpose: a prospect below the games
// floor never appears on the board, and without this endpoint "view other
// players' stats" would silently mean "view the top of a value board".
export interface ProspectDirectoryEntry {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  competitionLevel: CompetitionLevel;
  gamesLogged: number;
  pointsPerGame: number;
  rank: number | null;
}

export interface ProspectLeaderboardEntry extends ProspectDirectoryEntry {
  /** Always present here — an unranked prospect is not on the board. */
  rank: number;
  projectedDraftSlot: number | null;
  projectedValueUsd: number;
  reliabilityTier: ProspectReliabilityTier;
  isSelf: boolean;
}

// A rookie-scale anchor (pick 1 / 14 / 30) shown on the board as a benchmark,
// excluded from `total` and from ranking. The same move LeaderboardCard makes
// with the Elo model, and it gives a day-one board something to read against
// instead of rendering blank.
export interface ProspectLeaderboardReference {
  label: string;
  draftSlot: number;
  valueUsd: number;
}

export interface ProspectLeaderboard extends PagedResult<ProspectLeaderboardEntry> {
  /** Echoed, never hardcoded client-side — same rule as the accuracy board. */
  minimumGamesRequired: number;
  rookieScaleYear: string;
  references: ProspectLeaderboardReference[];
  // The signed-in user's own standing even when it falls outside this page of
  // results, so "where am I" costs no second request. Null when signed out or
  // unranked.
  yourStanding: ProspectLeaderboardEntry | null;
}

// GET /v1/me/become-pro — backs the header rank badge, which mounts on every
// page. Deliberately join-free and separate from the leaderboard so the header
// never pulls a paged list.
export interface ProspectRankSummary {
  rank: number | null;
  rankState: ProspectRankState;
  username: string | null;
  projectedValueUsd: number | null;
  gamesLogged: number;
  minimumGamesRequired: number;
  /** Oldest first — the Home card's value-over-time sparkline. */
  valueHistory: ProspectValuePoint[];
}

export interface ProspectValuePoint {
  computedAt: string;
  valueUsd: number;
}

// Widened radar input. A prospect has no nbaPlayerId and must never be given a
// fabricated one, so ComparisonTraitsRadar takes this narrower subject instead
// of a full Player. PlayerComparisonEntry satisfies it structurally, which is
// why ComparePage needs no change.
export interface TraitsRadarSubject {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TraitsComparisonEntry {
  player: TraitsRadarSubject;
  seasonAverages: SeasonAverages;
}
