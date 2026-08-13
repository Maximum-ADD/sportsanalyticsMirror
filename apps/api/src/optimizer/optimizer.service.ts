import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class OptimizerService {
  constructor(private readonly prisma: PrismaService) {}

  // The most recently generated lineup — predict.py/optimize.py (in
  // apps/optimizer) are the only things that ever create these; this
  // endpoint just reads whatever they last produced. Each slot is enriched
  // with the specific prediction (points/salary) that earned that player a
  // spot, not just the lineup's aggregate totals — makes it possible to
  // actually explain the pick, not just show a number.
  async getLatestLineup() {
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
}
