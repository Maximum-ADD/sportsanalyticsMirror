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
const RECENCY_DECAY = 0.8;
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
    // Excludes this game itself from every player's history — predicting
    // a game from its own boxscore would be leaking the answer, same
    // principle apps/predictor/elo.py applies to pre-game Elo state.
    const allPriorGameStats = await this.prisma.playerGameStat.findMany({
      where: { playerId: { in: rosterPlayers.map((player) => player.id) }, gameId: { not: gameId } },
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
