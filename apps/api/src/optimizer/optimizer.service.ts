import { Injectable } from "@nestjs/common";
import { DERIVED_DATA_TTL_MS } from "../cache/cache-ttl.js";
import { buildCacheKey, ResponseCacheService } from "../cache/response-cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Every read here is cached. Lineups and player predictions are written only
// by apps/optimizer's batch scripts, and none of them depend on who is
// asking, even though the routes require a session.
@Injectable()
export class OptimizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ResponseCacheService
  ) {}

  // The most recently generated lineup — predict.py/optimize.py (in
  // apps/optimizer) are the only things that ever create these; this
  // endpoint just reads whatever they last produced. Each slot is enriched
  // with the specific prediction (points/salary) that earned that player a
  // spot, not just the lineup's aggregate totals — makes it possible to
  // actually explain the pick, not just show a number.
  getLatestLineup() {
    return this.cache.getOrLoad(buildCacheKey("optimizer:latest-lineup"), DERIVED_DATA_TTL_MS, () =>
      this.readLatestLineup()
    );
  }

  // The uncached read behind getLatestLineup. Null when no lineup exists yet.
  private async readLatestLineup() {
    const lineup = await this.prisma.lineup.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        slots: {
          include: { player: { include: { team: true } } },
        },
      },
    });
    if (!lineup) return null;

    const predictions = await this.prisma.playerPrediction.findMany({
      where: { playerId: { in: lineup.slots.map((slot) => slot.playerId) } },
      orderBy: { asOf: "desc" },
      distinct: ["playerId"],
    });
    const predictionByPlayerId = new Map(predictions.map((prediction) => [prediction.playerId, prediction]));

    return {
      ...lineup,
      slots: lineup.slots.map((slot) => ({
        ...slot,
        predictedFantasyPoints: predictionByPlayerId.get(slot.playerId)?.predictedFantasyPoints ?? null,
        salary: predictionByPlayerId.get(slot.playerId)?.salary ?? null,
      })),
    };
  }

  // Lets the web app look up a specific player's latest prediction outside
  // the context of an existing lineup — e.g. to price up a hypothetical
  // swap into the client's local (never-persisted) lineup edit, the same
  // way getLatestLineup() already prices players already in a lineup.
  getPlayerPrediction(playerId: string) {
    return this.cache.getOrLoad(buildCacheKey("optimizer:player-prediction", [playerId]), DERIVED_DATA_TTL_MS, async () => {
      const prediction = await this.prisma.playerPrediction.findFirst({
        where: { playerId },
        orderBy: { asOf: "desc" },
      });
      return {
        predictedFantasyPoints: prediction?.predictedFantasyPoints ?? null,
        salary: prediction?.salary ?? null,
      };
    });
  }

  // Every player's latest prediction in one round trip — the optimizer
  // page's edit mode uses this to suggest value picks (best dollars-per-
  // point that still fit the board's remaining budget) without firing one
  // request per candidate. Same newest-first-then-distinct pattern as
  // getLatestLineup()'s prediction lookup, with the player embedded so the
  // client never has to join.
  getLatestPlayerPredictions() {
    return this.cache.getOrLoad(buildCacheKey("optimizer:latest-player-predictions"), DERIVED_DATA_TTL_MS, async () => {
      const predictions = await this.prisma.playerPrediction.findMany({
        orderBy: { asOf: "desc" },
        distinct: ["playerId"],
        include: { player: { include: { team: true } } },
      });
      return predictions.map((prediction) => ({
        playerId: prediction.playerId,
        predictedFantasyPoints: prediction.predictedFantasyPoints,
        salary: prediction.salary,
        asOf: prediction.asOf,
        player: prediction.player,
      }));
    });
  }
}
