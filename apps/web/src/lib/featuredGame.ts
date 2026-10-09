import type { TeamEloRating } from "@/types/nba";

// Which one game the landing page's header scoreboard shows, out of several
// playing (or finished) at the same time: the biggest matchup, judged by the
// teams' current Elo ratings.

// What a team with no rating yet counts as: apps/predictor/elo.py's
// STARTING_ELO, the rating every team starts from.
export const STARTING_ELO_RATING = 1500;

export interface MatchupEloRatings {
  homeTeamElo: number;
  awayTeamElo: number;
}

/**
 * Picks the game to feature: the one with the highest combined Elo rating of
 * its two teams. A tie on the combined rating goes to the game with the
 * single highest-rated team in it, and a tie on that too goes to whichever
 * game comes first, so the caller's own order (earliest tip-off, latest
 * finish) breaks it.
 *
 * @param games - the candidate games, in the caller's preferred order.
 * @param readMatchupEloRatings - the two teams' ratings for one game.
 * @returns the featured game, or null when there are no games.
 */
export function selectFeaturedGame<TGame>(
  games: readonly TGame[],
  readMatchupEloRatings: (game: TGame) => MatchupEloRatings
): TGame | null {
  let featuredGame: TGame | null = null;
  let featuredRatings: MatchupEloRatings | null = null;
  for (const game of games) {
    const ratings = readMatchupEloRatings(game);
    if (featuredRatings === null || isBiggerMatchup(ratings, featuredRatings)) {
      featuredGame = game;
      featuredRatings = ratings;
    }
  }
  return featuredGame;
}

/**
 * Whether one matchup strictly outranks another: a higher combined rating,
 * or an equal one with a higher-rated best team. Equal on both is not bigger.
 */
function isBiggerMatchup(candidate: MatchupEloRatings, current: MatchupEloRatings): boolean {
  const candidateCombinedElo = candidate.homeTeamElo + candidate.awayTeamElo;
  const currentCombinedElo = current.homeTeamElo + current.awayTeamElo;
  if (candidateCombinedElo !== currentCombinedElo) return candidateCombinedElo > currentCombinedElo;
  return (
    Math.max(candidate.homeTeamElo, candidate.awayTeamElo) > Math.max(current.homeTeamElo, current.awayTeamElo)
  );
}

/**
 * Indexes the current Elo ratings by a team key, for looking a game's teams
 * up by whichever id that game carries: the NBA's own team id for a game from
 * the live feed, this platform's team id for one from the database.
 *
 * @param ratings - GET /v1/teams/elo-ratings, or undefined when it's unavailable.
 * @param readTeamKey - the key to index each rating under.
 */
export function createEloRatingIndex<TKey>(
  ratings: readonly TeamEloRating[] | undefined,
  readTeamKey: (rating: TeamEloRating) => TKey
): Map<TKey, number> {
  return new Map((ratings ?? []).map((rating) => [readTeamKey(rating), rating.elo]));
}

/**
 * A team's current Elo rating, or the starting rating for a team that has
 * none (no rated games yet, or the ratings couldn't be read).
 */
export function readEloRating<TKey>(eloRatingIndex: ReadonlyMap<TKey, number>, teamKey: TKey): number {
  return eloRatingIndex.get(teamKey) ?? STARTING_ELO_RATING;
}
