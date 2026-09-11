import { Injectable } from "@nestjs/common";
import type { Player, PlayerGameStat, Team } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { GameWithTeamsAndPrediction } from "./games.service.js";
import { GamesService } from "./games.service.js";

export interface PredictedScorer {
  player: Player & { team: Team | null };
  predictedPoints: number;
  gamesConsidered: number;
}

export interface GameDetail extends GameWithTeamsAndPrediction {
  predictedScorers: PredictedScorer[];
}

// More recent games count more toward a player's predicted points for this
// matchup — same recency-weighting technique apps/optimizer/predict.py
// uses for fantasy points, applied here directly to raw scoring points
// instead, since "who's most likely to score N points" needs points on
// their own, not a fantasy composite. Kept in TypeScript rather than a new
// Python service: this is a read-time computation over data already in
// Postgres, not something that needs to write/persist a model output the
// way Elo ratings or Four Factors weights do.
//
// Three enhancements were backtested against a full season and
// deliberately left out — see apps/optimizer/predict.py's matching note
// and docs/reports for the full write-up, since all three were tried on
// that predictor too:
//   - Opponent-defense adjustment (scale the prediction by the upcoming
//     opponent's leak-free running points-allowed average relative to the
//     leaguewide average): improved MAE by only 0.002 points and didn't
//     reliably hold on a chronological validation split. Team-level
//     points-allowed only spans about +/-9% across the whole league — too
//     small a signal relative to a single player's game-to-game variance
//     (RMSE ~6 points here) to move individual predictions meaningfully.
//   - Minutes-aware prediction (predict minutes and points-per-minute
//     separately, both via this same recency-weighting technique, then
//     multiply, instead of averaging raw points directly): an initial
//     backtest looked like a real win, but that number came from a bug in
//     the backtest script's handling of DNP (0-minute) games — once
//     corrected to match this function's actual semantics, the edge
//     vanished and went slightly negative (-0.005 MAE full-season, -0.002
//     on a validation split). Not shipped. Worth remembering this one
//     specifically: it's a reminder to distrust a backtest result that
//     looks great until it's been checked against the exact logic being
//     validated, not an approximation of it.
//   - Minutes-trend adjustment (a DIFFERENT minutes signal than the
//     multiply-based one above: nudge the existing prediction by a small
//     amount based on whether a player's recent minutes deviate from
//     their longer-run baseline, rather than replacing the prediction).
//     This one WAS shipped on predict.py's fantasy-point prediction
//     (consistent MAE improvement on two validation splits, larger still
//     on players with an actual minutes swing) but NOT here — this
//     predictor's edge was negligible to zero on the same two splits (one
//     split's grid search picked strength=0.0 as optimal outright).
//     Plausibly because MOST_RECENT_GAMES_CONSIDERED (10, capped) already
//     makes this prediction more locally responsive to a minutes change
//     than predict.py's unbounded window, leaving less room for a
//     separate trend signal to add.
const RECENCY_DECAY = 0.8;

// Only regular-season games feed the recency weighting below, matching the
// same exclusion apps/predictor/elo.py and apps/optimizer/predict.py apply
// to their own model inputs: postseason scoring comes from a different
// distribution (shortened rotations, matchup-specific game plans), and
// since these are the *most recent* games a player has, they would carry
// the heaviest recency weight of all and dominate the projection.
// Postseason games are ingested and viewable, just never modelled from.
const MODELLED_SEASON_TYPE = "REGULAR" as const;
const MOST_RECENT_GAMES_CONSIDERED = 10;
const TOP_SCORERS_PER_TEAM_COUNT = 5;
const PREDICTED_POINTS_DECIMAL_PLACES = 1;

function predictPointsFromRecentGames(gameStats: PlayerGameStat[]): number {
  // gameStats arrives newest-first (see fetchRosterGameStats); reverse so
  // the decay weighting below runs oldest-to-newest, matching predict.py's
  // own convention of weighting backward from the most recent game.
  const oldestFirst = [...gameStats].reverse().slice(-MOST_RECENT_GAMES_CONSIDERED);
  if (oldestFirst.length === 0) return 0;

  let weight = 1;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    weightedSum += oldestFirst[i].points * weight;
    totalWeight += weight;
    weight *= RECENCY_DECAY;
  }

  const raw = weightedSum / totalWeight;
  return Math.round(raw * 10 ** PREDICTED_POINTS_DECIMAL_PLACES) / 10 ** PREDICTED_POINTS_DECIMAL_PLACES;
}

@Injectable()
export class GameDetailService {
  constructor(
    private readonly gamesService: GamesService,
    private readonly prisma: PrismaService
  ) {}

  async getGameDetail(gameId: string): Promise<GameDetail | null> {
    // GamesService.getGameById already joins the game's prediction in one
    // query (see GamesService.getGames' comment on why) — fetching it
    // again via PredictionsService here would be the exact N+1-flavored
    // mistake this file's roster/stats section was just fixed for, just
    // with N=1 instead of N=players. Every roster/network round trip in
    // this method costs several seconds against Supabase's pooler, so
    // each one removed is worth it.
    const game = await this.gamesService.getGameById(gameId);
    if (!game) return null;

    const rosterPlayers = await this.prisma.player.findMany({
      where: { teamId: { in: [game.homeTeamId, game.awayTeamId] } },
      include: { team: true },
    });

    // One query for every roster player's game history, not one query per
    // player — the Predictions page hit exactly this N+1 pattern (see
    // GamesService.getGames' comment) once real ingested data put a
    // network hop between the API and Postgres instead of localhost; a
    // 15-20 player roster pair doing individual round trips is the same
    // mistake at a smaller scale.
    // Restricted to games strictly before this game's date, not just
    // "not this game" — excluding only gameId still let a player's stats
    // from games *after* the one being predicted leak into their
    // "predicted" points for it (caught in review: for a historical game,
    // gameId:{not} alone doesn't stop a later game's boxscore from
    // influencing an earlier prediction). Two games on the exact same date
    // are treated as unordered relative to each other — a strict "<", not
    // "<=", so neither can inform the other. Same principle
    // apps/predictor/elo.py and four_factors.py apply via their
    // chronological forward-pass/pre-game-snapshot construction.
    const allPriorGameStats = await this.prisma.playerGameStat.findMany({
      where: {
        playerId: { in: rosterPlayers.map((player) => player.id) },
        game: { gameDate: { lt: game.gameDate }, seasonType: MODELLED_SEASON_TYPE },
      },
      orderBy: { game: { gameDate: "desc" } },
    });
    const priorGameStatsByPlayerId = new Map<string, PlayerGameStat[]>();
    for (const stat of allPriorGameStats) {
      const existing = priorGameStatsByPlayerId.get(stat.playerId);
      if (existing) existing.push(stat);
      else priorGameStatsByPlayerId.set(stat.playerId, [stat]);
    }

    const predictedScorers = rosterPlayers.map((player) => {
      const priorGameStats = priorGameStatsByPlayerId.get(player.id) ?? [];
      return {
        player,
        predictedPoints: predictPointsFromRecentGames(priorGameStats),
        gamesConsidered: Math.min(priorGameStats.length, MOST_RECENT_GAMES_CONSIDERED),
      };
    });

    // Top scorers per team, not top-N across both rosters combined — a
    // combined list could easily be 4 players from one team and 1 from
    // the other (whichever roster happens to run hotter), which isn't
    // useful for comparing the two sides or for the court view, which
    // needs both teams represented.
    const topScorersByTeam = (teamId: string) =>
      predictedScorers
        .filter((scorer) => scorer.player.teamId === teamId && scorer.gamesConsidered > 0)
        .sort((a, b) => b.predictedPoints - a.predictedPoints)
        .slice(0, TOP_SCORERS_PER_TEAM_COUNT);

    const topScorers = [...topScorersByTeam(game.homeTeamId), ...topScorersByTeam(game.awayTeamId)];

    return { ...game, predictedScorers: topScorers };
  }
}
