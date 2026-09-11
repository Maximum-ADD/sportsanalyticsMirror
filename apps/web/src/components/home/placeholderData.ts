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
// WIRED. The board now reads GET /v1/me/watchlist and its own write routes;
// its placeholder rows and WatchlistEntry type were deleted with it rather
// than left here to rot into a second, wrong definition of the same shape.
// The live one lives in types/nba.ts.
//
// The few players below are what the still-unwired modules borrowed from that
// list, kept as their own small const so removing the board did not quietly
// change what those modules render.
const SGA: PlayerRef = { nbaPlayerId: 1628983, firstName: "Shai", lastName: "Gilgeous-Alexander" };
const JOKIC: PlayerRef = { nbaPlayerId: 203999, firstName: "Nikola", lastName: "Jokić" };
const GIANNIS: PlayerRef = { nbaPlayerId: 203507, firstName: "Giannis", lastName: "Antetokounmpo" };
const WEMBANYAMA: PlayerRef = { nbaPlayerId: 1641705, firstName: "Victor", lastName: "Wembanyama" };
const CUNNINGHAM: PlayerRef = { nbaPlayerId: 1630595, firstName: "Cade", lastName: "Cunningham" };
const SENGUN: PlayerRef = { nbaPlayerId: 1630578, firstName: "Alperen", lastName: "Şengün" };

// How many players the placeholder modules assume are followed. Only Add To
// Locker reads it, and that module is off the page until it has a real
// endpoint behind it.
const PLACEHOLDER_FOLLOWED_PLAYER_COUNT = 9;

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
  /** Route to this game's detail page. Undefined until real ids are wired in. */
  href?: string;
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
export const LOCKER_SUMMARY = {
  players: PLACEHOLDER_FOLLOWED_PLAYER_COUNT,
  teams: FOLLOWED_TEAMS.length,
  primaryTeam: "Oklahoma City Thunder",
};

// ── Jump back in ──────────────────────────────────────────────────────────
// Will come from ViewEvent. The only module that personalizes with zero
// user effort, which makes it the safety net for an account that follows
// nothing.
export interface RecentView {
  id: string;
  label: string;
  kind: "player" | "team" | "game";
  href?: string;
  viewCount: number;
  player?: PlayerRef;
  team?: TeamRef;
}

// Every card on /home links to a route that resolves an INTERNAL uuid
// (/players/:id, /teams/:id, /games/:id, /compare?ids=). Placeholder rows have
// no such id — they are not database rows — so `href` is deliberately left
// undefined here and the cards render as non-navigating via MaybeLink. An
// earlier version linked with `nbaPlayerId` and with literal "placeholder-*"
// strings, which made every card fire a request that could only 404.
export const RECENT_VIEWS: RecentView[] = [
  { id: "v1", label: "Jokić", kind: "player", viewCount: 4, player: JOKIC },
  { id: "v2", label: "Thunder", kind: "team", viewCount: 1, team: OKC },
  { id: "v3", label: "OKC @ DEN", kind: "game", viewCount: 1 },
  { id: "v4", label: "Wembanyama", kind: "player", viewCount: 1, player: WEMBANYAMA },
  { id: "v5", label: "Şengün", kind: "player", viewCount: 2, player: SENGUN },
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
  /** Route to /compare for these players. Undefined until real ids are wired in. */
  href?: string;
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
  { id: "c1", name: "MVP ladder", players: [SGA, JOKIC, GIANNIS] },
  { id: "c2", name: "Sophomore wings", players: [WEMBANYAMA, CUNNINGHAM] },
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
