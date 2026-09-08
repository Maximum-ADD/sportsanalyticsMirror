// PLACEHOLDER DATA — nothing on /home is wired to the API yet.
//
// Every figure below is invented for layout purposes. This file is the only
// place /home gets data from, deliberately: wiring the page up means
// replacing these exports with queries and deleting this file, not hunting
// literals through nine components.
//
// The shapes are Pick<>s of the real `Player`/`Team` types (and mirror
// `SeasonAverages` field names) so that swap is a type-level no-op rather
// than a rewrite. Where a route does not exist yet, the comment above the
// export names the one it will need.
//
// The nbaPlayerId/nbaTeamId values are real, so PlayerHeadshot and TeamBadge
// pull genuine art from nba.com's CDN. If any id is wrong those components
// fall back to initials and a colored badge by design (see nbaMedia.ts), so
// a bad id here is cosmetic, never a broken image.

import type { Player, Team } from "@/types/nba";

type PlayerRef = Pick<Player, "nbaPlayerId" | "firstName" | "lastName">;
type TeamRef = Pick<Team, "abbreviation" | "nbaTeamId">;

const OKC: TeamRef = { abbreviation: "OKC", nbaTeamId: 1610612760 };
const DEN: TeamRef = { abbreviation: "DEN", nbaTeamId: 1610612743 };
const MIL: TeamRef = { abbreviation: "MIL", nbaTeamId: 1610612749 };
const LAL: TeamRef = { abbreviation: "LAL", nbaTeamId: 1610612747 };
const SAS: TeamRef = { abbreviation: "SAS", nbaTeamId: 1610612759 };
const MIN: TeamRef = { abbreviation: "MIN", nbaTeamId: 1610612750 };
const NYK: TeamRef = { abbreviation: "NYK", nbaTeamId: 1610612752 };
const DET: TeamRef = { abbreviation: "DET", nbaTeamId: 1610612765 };
const HOU: TeamRef = { abbreviation: "HOU", nbaTeamId: 1610612745 };

// ── Beat the Model ────────────────────────────────────────────────────────
// Will come from GET /v1/me/challenge/next, which returns a completed game
// with homeScore/awayScore deleted from the payload. `finalHomeScore` and
// `finalAwayScore` below stand in for what POST /v1/me/picks returns once a
// pick has been graded — they are NOT sent to the client before then, and
// keeping them here is a placeholder shortcut, not the intended contract.
export interface ModelChallenge {
  gameId: string;
  /** Free-text season label, matching Game.season. */
  season: string;
  playedOn: string;
  venue: string;
  homeTeam: TeamRef;
  homeCity: string;
  awayTeam: TeamRef;
  awayCity: string;
  /** Elo win probability for the home team, in [0, 1]. */
  homeWinProbability: number;
  homeTeamEloPre: number;
  awayTeamEloPre: number;
  /** Four Factors predicted margin, home minus away, in points. */
  predictedMarginHome: number;
  marginMethod: "regression" | "heuristic";
  finalHomeScore: number;
  finalAwayScore: number;
  /** Index of this call in the user's run, for the card's kicker. */
  callNumber: number;
}

export const CHALLENGE: ModelChallenge = {
  gameId: "0022500612",
  season: "2025-26",
  playedOn: "14 January 2026",
  venue: "Ball Arena",
  homeTeam: DEN,
  homeCity: "Denver",
  awayTeam: OKC,
  awayCity: "Oklahoma City",
  homeWinProbability: 0.36,
  homeTeamEloPre: 1548,
  awayTeamEloPre: 1612,
  predictedMarginHome: -5.1,
  marginMethod: "regression",
  finalHomeScore: 121,
  finalAwayScore: 118,
  callNumber: 21,
};

/** Stands in for the aggregate over GamePick rows. */
export const PICK_RECORD = { wins: 12, losses: 7, modelWins: 11, modelLosses: 8 };

// ── Watchlist board ───────────────────────────────────────────────────────
// Will come from GET /v1/me/dashboard, joining FollowedPlayer against ONE
// groupBy over PlayerGameStat — never a per-player loop through StatsService.
export interface WatchlistEntry {
  player: PlayerRef;
  team: TeamRef;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  /** Points scored in the last eight games, oldest first. */
  recentPoints: number[];
  /** The user's own scouting note, stored on the FollowedPlayer row. */
  note?: string;
}

export const WATCHLIST: WatchlistEntry[] = [
  {
    player: { nbaPlayerId: 1628983, firstName: "Shai", lastName: "Gilgeous-Alexander" },
    team: OKC,
    pointsPerGame: 32.7,
    reboundsPerGame: 5.1,
    assistsPerGame: 6.4,
    recentPoints: [34, 28, 41, 30, 37, 25, 33, 39],
    note: "MVP pace — watch the FT rate",
  },
  {
    player: { nbaPlayerId: 203999, firstName: "Nikola", lastName: "Jokić" },
    team: DEN,
    pointsPerGame: 29.6,
    reboundsPerGame: 12.8,
    assistsPerGame: 10.2,
    recentPoints: [26, 31, 24, 38, 29, 33, 27, 35],
  },
  {
    player: { nbaPlayerId: 203507, firstName: "Giannis", lastName: "Antetokounmpo" },
    team: MIL,
    pointsPerGame: 30.4,
    reboundsPerGame: 11.9,
    assistsPerGame: 6.1,
    recentPoints: [35, 28, 32, 26, 41, 30, 24, 33],
  },
  {
    player: { nbaPlayerId: 1629029, firstName: "Luka", lastName: "Dončić" },
    team: LAL,
    pointsPerGame: 28.2,
    reboundsPerGame: 8.3,
    assistsPerGame: 7.7,
    recentPoints: [24, 31, 27, 35, 22, 29, 33, 26],
  },
  {
    player: { nbaPlayerId: 1641705, firstName: "Victor", lastName: "Wembanyama" },
    team: SAS,
    pointsPerGame: 25.1,
    reboundsPerGame: 11.0,
    assistsPerGame: 3.8,
    recentPoints: [22, 29, 18, 31, 26, 24, 33, 20],
    note: "blocks are the tell",
  },
  {
    player: { nbaPlayerId: 1630162, firstName: "Anthony", lastName: "Edwards" },
    team: MIN,
    pointsPerGame: 27.3,
    reboundsPerGame: 5.6,
    assistsPerGame: 4.5,
    recentPoints: [31, 24, 29, 22, 35, 27, 30, 25],
  },
  {
    player: { nbaPlayerId: 1628973, firstName: "Jalen", lastName: "Brunson" },
    team: NYK,
    pointsPerGame: 26.4,
    reboundsPerGame: 3.0,
    assistsPerGame: 7.2,
    recentPoints: [28, 22, 31, 25, 34, 23, 29, 27],
  },
  {
    player: { nbaPlayerId: 1630595, firstName: "Cade", lastName: "Cunningham" },
    team: DET,
    pointsPerGame: 25.9,
    reboundsPerGame: 6.3,
    assistsPerGame: 9.4,
    recentPoints: [21, 30, 26, 33, 24, 28, 22, 31],
  },
  {
    player: { nbaPlayerId: 1630578, firstName: "Alperen", lastName: "Şengün" },
    team: HOU,
    pointsPerGame: 21.5,
    reboundsPerGame: 10.4,
    assistsPerGame: 5.6,
    recentPoints: [19, 26, 22, 18, 28, 24, 20, 27],
  },
];

// ── Your teams ────────────────────────────────────────────────────────────
// Will come from FollowedTeam joined against games. Note that GET /v1/games
// has no teamId filter today — adding one is a prerequisite for this module.
// Scores and the W/L badge are oriented to the FOLLOWED team, not the home
// team, which is the whole point of the module.
export interface FollowedTeamResult {
  gameId: string;
  yourTeam: TeamRef;
  opponent: TeamRef;
  yourScore: number;
  opponentScore: number;
  /** How the model called it, phrased from the followed team's side. */
  modelCall: string;
  won: boolean;
}

export const FOLLOWED_TEAMS = ["Thunder", "Nuggets"];

export const TEAM_RESULTS: FollowedTeamResult[] = [
  { gameId: "0022500612", yourTeam: OKC, opponent: DEN, yourScore: 121, opponentScore: 118, modelCall: "OKC 64%", won: true },
  { gameId: "0022500588", yourTeam: OKC, opponent: MIL, yourScore: 112, opponentScore: 104, modelCall: "MIL 55%", won: true },
  { gameId: "0022500561", yourTeam: OKC, opponent: MIN, yourScore: 115, opponentScore: 118, modelCall: "OKC 58%", won: false },
  { gameId: "0022500544", yourTeam: DEN, opponent: LAL, yourScore: 127, opponentScore: 120, modelCall: "DEN 71%", won: true },
  { gameId: "0022500519", yourTeam: DEN, opponent: SAS, yourScore: 105, opponentScore: 109, modelCall: "DEN 66%", won: false },
];

// ── Add to locker ─────────────────────────────────────────────────────────
export const LOCKER_SUMMARY = { players: WATCHLIST.length, teams: FOLLOWED_TEAMS.length, primaryTeam: "Oklahoma City Thunder" };

// ── Jump back in ──────────────────────────────────────────────────────────
// Will come from ViewEvent. The only module that personalizes with zero
// user effort, which makes it the safety net for an account that follows
// nothing.
export interface RecentView {
  id: string;
  label: string;
  kind: "player" | "team" | "game";
  href: string;
  viewCount: number;
  player?: PlayerRef;
  team?: TeamRef;
}

export const RECENT_VIEWS: RecentView[] = [
  { id: "v1", label: "Jokić", kind: "player", href: "/players/placeholder-jokic", viewCount: 4, player: WATCHLIST[1].player },
  { id: "v2", label: "Thunder", kind: "team", href: "/teams/placeholder-okc", viewCount: 1, team: OKC },
  { id: "v3", label: "OKC @ DEN", kind: "game", href: "/games/placeholder-okc-den", viewCount: 1 },
  { id: "v4", label: "Wembanyama", kind: "player", href: "/players/placeholder-wemby", viewCount: 1, player: WATCHLIST[4].player },
  { id: "v5", label: "Şengün", kind: "player", href: "/players/placeholder-sengun", viewCount: 2, player: WATCHLIST[8].player },
];

// ── Saved shelf ───────────────────────────────────────────────────────────
// Will come from SavedComparison and SavedLineup. The drift line is only
// computable because SavedLineupSlot freezes salaryAtSave and
// predictedPointsAtSave — PlayerPrediction is append-and-take-latest, so
// re-deriving those numbers would silently change what the user saved.
export interface SavedComparison {
  id: string;
  name: string;
  players: PlayerRef[];
}

export interface SavedLineup {
  id: string;
  name: string;
  predictedPoints: number;
  salary: number;
  /** Null when nothing has moved since the lineup was saved. */
  drift: { points: number; salary: number; overCap: boolean; savedOn: string } | null;
}

export const SAVED_COMPARISONS: SavedComparison[] = [
  { id: "c1", name: "MVP ladder", players: [WATCHLIST[0].player, WATCHLIST[1].player, WATCHLIST[2].player] },
  { id: "c2", name: "Sophomore wings", players: [WATCHLIST[4].player, WATCHLIST[7].player] },
];

export const SAVED_LINEUPS: SavedLineup[] = [
  {
    id: "l1",
    name: "Value Core",
    predictedPoints: 214.8,
    salary: 49200,
    drift: { points: 4.6, salary: 1200, overCap: true, savedOn: "12 Mar" },
  },
  { id: "l2", name: "Cheap guards", predictedPoints: 198.1, salary: 44800, drift: null },
];

// ── Model accuracy ledger ─────────────────────────────────────────────────
// Will come from GET /v1/analytics/model-accuracy — a PUBLIC route needing
// zero new models, computable from games that already have both a final
// score and a GamePrediction. Deliberately identical for every account:
// it is the benchmark a personal record is measured against, so "published"
// has to actually mean published.
export interface CalibrationBucket {
  band: string;
  modelSaid: number;
  actuallyWon: number;
  games: number;
}

export const MODEL_ACCURACY = {
  accuracy: 0.613,
  brierScore: 0.221,
  /** Always picking the home team. Without this, "61.3%" means nothing. */
  homeBaseline: 0.552,
  gamesBacktested: 284,
  season: "2025-26",
  /** Forward (pre-game) predictions. Honestly zero until a schedule ingest exists. */
  forwardPredictions: 0,
};

/** Buckets below this many games are shown as too thin to read as fact. */
export const THIN_BUCKET_GAMES = 25;

export const CALIBRATION: CalibrationBucket[] = [
  { band: "50–60%", modelSaid: 0.551, actuallyWon: 0.529, games: 87 },
  { band: "60–70%", modelSaid: 0.648, actuallyWon: 0.635, games: 74 },
  { band: "70–80%", modelSaid: 0.742, actuallyWon: 0.767, games: 60 },
  { band: "80–90%", modelSaid: 0.839, actuallyWon: 0.81, games: 42 },
  { band: "90–100%", modelSaid: 0.926, actuallyWon: 0.905, games: 21 },
];
