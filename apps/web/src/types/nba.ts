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
}

export interface SeasonAverages {
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalPercentage: number;
  threePointPercentage: number;
  freeThrowPercentage: number;
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
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
