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
}

// One player's identity plus their season line — the unit GET
// /v1/players/compare returns, one per player in the comparison.
export interface PlayerComparisonEntry {
  player: Player;
  seasonAverages: SeasonAverages;
}

export interface PlayerComparisonResponse {
  players: PlayerComparisonEntry[];
}

export interface GameLogEntry {
  gameId: string;
  gameDate: string;
  points: number;
}

export interface PlayerStatsResponse {
  playerId: string;
  seasonAverages: SeasonAverages;
  gameLog: GameLogEntry[];
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
