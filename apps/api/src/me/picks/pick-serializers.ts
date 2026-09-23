import type { Game, GamePick, GamePrediction, PickOutcome, Team } from "@prisma/client";
import { determineModelFavoriteTeamId, gradePickAgainstWinner } from "./pick-grading.js";

// Response shaping for the challenge mechanic, kept as pure functions rather
// than inline object literals in the services. The challenge payload in
// particular is a security-shaped concern — it exists to WITHHOLD the final
// score — so it lives in one auditable place with its own unit spec, instead
// of being re-derived by every caller that touches a Game row.

// A game row joined to the two Team rows the challenge card renders.
export type GameWithTeams = Game & { homeTeam: Team; awayTeam: Team };

// The subset of a Team a challenge card needs. Team holds no game outcome, so
// this is a convenience rather than a redaction.
export interface ChallengeTeam {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  logoUrl: string | null;
}

// The model's published view of a game: everything GamePrediction holds
// except its own row bookkeeping (id/gameId/createdAt).
export interface ChallengePrediction {
  homeWinProbability: number;
  homeTeamEloPre: number;
  awayTeamEloPre: number;
  predictedMarginHome: number | null;
  marginMethod: string | null;
}

// A game put to the user to call. Note what is NOT here: homeScore and
// awayScore. See toChallengeGame().
export interface ChallengeGame {
  gameId: string;
  nbaGameId: string;
  gameDate: Date;
  season: string;
  homeTeam: ChallengeTeam;
  awayTeam: ChallengeTeam;
  prediction: ChallengePrediction;
}

// A game that has been played to a result: its two sides, and a final score
// whose halves are both known. The nullable scores on the Game row have been
// checked away by the time a call is graded.
export interface DecidedGame {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

// The final score, released only once a pick row exists for it.
export interface RevealedFinalScore {
  homeScore: number;
  awayScore: number;
  winningTeamId: string;
}

// What the model was saying at the moment the call was made, read back from
// the pick's own snapshot columns rather than from GamePrediction (which the
// predictor overwrites in place on every run).
export interface ModelCallAtPick {
  homeWinProbability: number;
  predictedMarginHome: number | null;
  homeTeamElo: number;
  awayTeamElo: number;
  favoriteTeamId: string;
  outcome: PickOutcome;
}

// A stored call with its grading and the now-public answer.
export interface GradedPickResult {
  id: string;
  gameId: string;
  pickedTeamId: string;
  outcome: PickOutcome;
  createdAt: Date;
  finalScore: RevealedFinalScore;
  model: ModelCallAtPick;
}

// Trims a Team row to the fields a challenge card renders.
function toChallengeTeam(team: Team): ChallengeTeam {
  return {
    id: team.id,
    name: team.name,
    city: team.city,
    abbreviation: team.abbreviation,
    logoUrl: team.logoUrl,
  };
}

// Trims a GamePrediction row to the model figures the user is invited to
// disagree with.
function toChallengePrediction(prediction: GamePrediction): ChallengePrediction {
  return {
    homeWinProbability: prediction.homeWinProbability,
    homeTeamEloPre: prediction.homeTeamEloPre,
    awayTeamEloPre: prediction.awayTeamEloPre,
    predictedMarginHome: prediction.predictedMarginHome,
    marginMethod: prediction.marginMethod,
  };
}

/**
 * Builds the payload for a game the user is being asked to call.
 *
 * @param game - the completed game, joined to its home and away Team rows.
 * @param prediction - the model's prediction for that same game.
 * @returns the game, its two teams and the model's numbers, with the final
 *          score absent.
 *
 * The whole mechanic depends on the server knowing the answer while the
 * client does not, so homeScore and awayScore must never reach a caller who
 * has not yet committed to a call. This builds an explicit allow-list rather
 * than copying the row and deleting the two score keys: a `delete` only
 * removes the fields someone remembered to name, so the day a column like
 * `finalMargin` is added to Game it would start leaking silently, whereas an
 * allow-list simply never picks it up.
 */
export function toChallengeGame(game: GameWithTeams, prediction: GamePrediction): ChallengeGame {
  return {
    gameId: game.id,
    nbaGameId: game.nbaGameId,
    gameDate: game.gameDate,
    season: game.season,
    homeTeam: toChallengeTeam(game.homeTeam),
    awayTeam: toChallengeTeam(game.awayTeam),
    prediction: toChallengePrediction(prediction),
  };
}

/**
 * Builds the response for a call that has just been stored and graded.
 *
 * @param pick - the persisted GamePick row, including its *AtPick snapshot.
 * @param decidedGame - the game's two team ids and its real final score, both
 *                      scores known non-null because a call is only accepted
 *                      on a decided game.
 * @param winningTeamId - the team that won, from determineWinningTeamId().
 * @returns the graded call, the released final score, and how the model's own
 *          call on the same game fared.
 *
 * Releasing the score here is deliberate and is the one moment it is safe:
 * the row already exists, so the user cannot revise their call in light of it.
 */
export function toGradedPickResult(
  pick: GamePick,
  decidedGame: DecidedGame,
  winningTeamId: string
): GradedPickResult {
  const favoriteTeamId = determineModelFavoriteTeamId(decidedGame, pick.modelHomeWinProbabilityAtPick);
  return {
    id: pick.id,
    gameId: pick.gameId,
    pickedTeamId: pick.pickedTeamId,
    outcome: pick.outcome,
    createdAt: pick.createdAt,
    finalScore: {
      homeScore: decidedGame.homeScore,
      awayScore: decidedGame.awayScore,
      winningTeamId,
    },
    model: {
      homeWinProbability: pick.modelHomeWinProbabilityAtPick,
      predictedMarginHome: pick.modelPredictedMarginAtPick,
      homeTeamElo: pick.homeTeamEloAtPick,
      awayTeamElo: pick.awayTeamEloAtPick,
      favoriteTeamId,
      outcome: gradePickAgainstWinner(favoriteTeamId, winningTeamId),
    },
  };
}
