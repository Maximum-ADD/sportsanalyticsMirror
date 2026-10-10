import { HttpStatus, Injectable } from "@nestjs/common";
import { DERIVED_DATA_TTL_MS } from "../cache/cache-ttl.js";
import { buildCacheKey, ResponseCacheService } from "../cache/response-cache.service.js";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { LINEUP_SIZE, MINIMUM_FORWARDS, MINIMUM_GUARDS } from "./lineup-rules.js";
import { solveLineups, type LineupRequest } from "./lineup-solver.js";

function infeasibleLineup(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "INFEASIBLE_LINEUP", message);
}

// "A", "A and B", "A, B and C".
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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

  /**
   * Solves for the best lineups under the caller's own rules: players to
   * lock in, players to leave out, and a budget. Unlike getLatestLineup,
   * which reads what optimize.py last wrote, this runs the solver on each
   * request (lineup-solver.ts explains why it's TypeScript), over the same
   * pool optimize.py reads: every player's latest projection.
   *
   * Cached per distinct set of rules, since the answer depends only on them
   * and on the projections, which change only when predict.py runs.
   *
   * @throws ApiException 404 NOT_FOUND when predict.py has never run.
   * @throws ApiException 400 INFEASIBLE_LINEUP when no lineup meets the
   *   rules, with a message naming which rule to change.
   */
  solveLineups(request: LineupRequest) {
    const lockedPlayerIds = [...new Set(request.lockedPlayerIds)].sort();
    const excludedPlayerIds = [...new Set(request.excludedPlayerIds)].sort();
    const normalized = { ...request, lockedPlayerIds, excludedPlayerIds };
    return this.cache.getOrLoad(
      buildCacheKey("optimizer:solve", [normalized.budget, lockedPlayerIds, excludedPlayerIds, normalized.lineupCount]),
      DERIVED_DATA_TTL_MS,
      () => this.computeLineups(normalized)
    );
  }

  private async computeLineups(request: LineupRequest & { lockedPlayerIds: string[]; excludedPlayerIds: string[] }) {
    const pool = await this.getLatestPlayerPredictions();
    if (pool.length === 0) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "No projections have been generated yet — run predict.py in apps/optimizer."
      );
    }
    const poolById = new Map(pool.map((entry) => [entry.playerId, entry]));

    // The solver can only say "no projection for <id>". Look the names up
    // here so the message says who, and whether the id exists at all.
    const unprojectedLockIds = request.lockedPlayerIds.filter((id) => !poolById.has(id));
    if (unprojectedLockIds.length > 0) {
      const players = await this.prisma.player.findMany({
        where: { id: { in: unprojectedLockIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      const nameById = new Map(players.map((player) => [player.id, `${player.firstName} ${player.lastName}`]));
      const names = unprojectedLockIds.map((id) => nameById.get(id) ?? `an unknown player (id ${id})`);
      throw infeasibleLineup(
        `${joinNames(names)} ${names.length === 1 ? "has" : "have"} no projection, so the solver has no points or ` +
          "salary to plan with (predict.py only projects players with game history). Unlock " +
          `${names.length === 1 ? "that player" : "those players"} to solve.`
      );
    }

    const result = solveLineups(
      pool.map((entry) => ({
        id: entry.playerId,
        name: `${entry.player.firstName} ${entry.player.lastName}`,
        position: entry.player.position,
        predictedFantasyPoints: entry.predictedFantasyPoints,
        salary: entry.salary,
      })),
      request
    );
    if (!result.feasible) {
      throw infeasibleLineup(result.reason);
    }

    const lockedIds = new Set(request.lockedPlayerIds);
    const newestAsOf = pool.reduce((newest, entry) => (entry.asOf > newest ? entry.asOf : newest), pool[0].asOf);
    return {
      budget: request.budget,
      rules: { lineupSize: LINEUP_SIZE, minimumGuards: MINIMUM_GUARDS, minimumForwards: MINIMUM_FORWARDS },
      lockedPlayerIds: request.lockedPlayerIds,
      excludedPlayerIds: request.excludedPlayerIds,
      projectionsAsOf: newestAsOf,
      lineups: result.lineups.map((lineup, index) => ({
        rank: index + 1,
        totalPredictedPoints: lineup.totalPredictedPoints,
        totalSalary: lineup.totalSalary,
        slots: lineup.players.map((candidate) => ({
          playerId: candidate.id,
          player: poolById.get(candidate.id)!.player,
          predictedFantasyPoints: candidate.predictedFantasyPoints,
          salary: candidate.salary,
          isLocked: lockedIds.has(candidate.id),
        })),
      })),
    };
  }
}
