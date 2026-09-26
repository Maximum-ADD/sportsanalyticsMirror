import { Injectable } from "@nestjs/common";
import type { ProspectValuation, ProspectValuationModel } from "@prisma/client";
import { USER_ACTIVITY_TTL_MS } from "../cache/cache-ttl.js";
import { buildCacheKey, ResponseCacheService } from "../cache/response-cache.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { deriveSeasonAverages } from "../players/season-averages.js";
import { toDerivableGame } from "./prospect-games.js";
import { applyValuationModel, type ValuationModelBundle, type ValuationResult } from "./valuation-model.js";

// The trained model changes only when somebody re-trains it after an
// ingestion, so it is cached — briefly, since that TTL is what bounds how long
// a freshly trained model waits to take effect.
const MODEL_CACHE_KEY = buildCacheKey("become-pro-model", ["current"]);

// How many players actually drafted at the projected slot to name on the
// page — "Pick 18: a real name, a real year".
const SLOT_ALUMNI_COUNT = 3;

export interface CurrentValuationModel {
  id: string;
  bundle: ValuationModelBundle;
}

/**
 * Values Become Pro seasons with the latest trained model.
 *
 * The model is TRAINED in Python (apps/valuation/train_valuation_model.py) and
 * APPLIED here, so a prospect is valued the instant their season changes
 * rather than whenever somebody next runs a script — the whole reason the
 * split exists. See ProspectValuationModel's schema comment.
 */
@Injectable()
export class ProspectValuationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ResponseCacheService
  ) {}

  /** The newest trained model, or null when none has been trained yet. */
  currentModel(): Promise<CurrentValuationModel | null> {
    return this.cache.getOrLoad(MODEL_CACHE_KEY, USER_ACTIVITY_TTL_MS, async () => {
      const row = await this.prisma.prospectValuationModel.findFirst({ orderBy: { fittedAt: "desc" } });
      return row ? toCurrentModel(row) : null;
    });
  }

  /**
   * Re-values one season against the current model.
   *
   * Called after every write that can move the figure — a game added,
   * corrected or removed, or the season's competition level changed — and
   * before the owner's page is read, so a newly trained model takes effect on
   * their next visit with no restart and no admin action.
   *
   * Appends a ProspectValuation row only when the figure actually changed, so
   * the value-over-time sparkline shows movement rather than a flat point for
   * every typo fixed. Does nothing when no model has been trained: the season
   * then reads as AWAITING_MODEL, which says exactly that, rather than getting
   * a figure no model produced.
   */
  async revalueSeason(seasonId: string): Promise<void> {
    const model = await this.currentModel();
    if (!model) return;

    const season = await this.prisma.prospectSeason.findUnique({
      where: { id: seasonId },
      include: { games: true, valuations: { orderBy: { computedAt: "desc" }, take: 1 } },
    });
    if (!season) return;

    const latest = season.valuations[0] ?? null;
    const result = applyValuationModel(model.bundle, {
      averages: deriveSeasonAverages(season.games.map(toDerivableGame)),
      competitionLevel: season.competitionLevel,
      gamesLogged: season.games.length,
    });

    if (result === null) {
      // Below the floor. Nothing to record unless the season HAD a figure —
      // games deleted back under the floor — in which case a null row
      // supersedes it, or the page would keep showing a value its own game
      // count no longer supports.
      if (latest && latest.projectedValueUsd !== null) {
        await this.prisma.prospectValuation.create({
          data: {
            seasonId,
            modelId: model.id,
            modelVersion: model.bundle.modelVersion,
            rookieScaleYear: model.bundle.rookieScale.year,
            levelFactor: latest.levelFactor,
            levelFactorBasis: latest.levelFactorBasis,
            drivers: [],
            comparablePlayerIds: [],
            comparableScores: [],
            slotAlumniPlayerIds: [],
          },
        });
      }
      return;
    }

    const slotAlumniPlayerIds = await this.slotAlumni(result.projectedDraftSlot);
    if (latest && isUnchanged(latest, model.id, result, slotAlumniPlayerIds)) return;

    await this.prisma.prospectValuation.create({
      data: {
        seasonId,
        modelId: model.id,
        modelVersion: model.bundle.modelVersion,
        projectedDraftSlot: result.projectedDraftSlot,
        projectedValueUsd: result.projectedValueUsd,
        projectedValueLowUsd: result.projectedValueLowUsd,
        projectedValueHighUsd: result.projectedValueHighUsd,
        rookieScaleYear: result.rookieScaleYear,
        levelFactor: result.levelFactor,
        levelFactorBasis: result.levelFactorBasis,
        drivers: result.drivers as unknown as object,
        comparablePlayerIds: result.comparablePlayerIds,
        comparableScores: result.comparableScores,
        slotAlumniPlayerIds,
      },
    });
  }

  /**
   * Re-values a season only if its figure came from an older model.
   *
   * The cheap check runs first so the owner's page — read far more often than
   * it is written — does not redo the whole valuation on every visit.
   */
  async refreshIfStale(seasonId: string, latestModelId: string | null | undefined): Promise<void> {
    const model = await this.currentModel();
    if (!model || latestModelId === model.id) return;
    await this.revalueSeason(seasonId);
  }

  // Players actually drafted at this pick, most recent first.
  private async slotAlumni(slot: number): Promise<string[]> {
    const players = await this.prisma.player.findMany({
      where: { draftNumber: slot, draftYear: { not: null } },
      orderBy: { draftYear: "desc" },
      take: SLOT_ALUMNI_COUNT,
      select: { id: true },
    });
    return players.map((player) => player.id);
  }
}

function toCurrentModel(row: ProspectValuationModel): CurrentValuationModel {
  return { id: row.id, bundle: row.bundle as unknown as ValuationModelBundle };
}

// Whether a fresh result would say exactly what the latest stored row already
// says. The model id is part of it: a re-trained model that happens to land on
// the same slot still produced a new valuation, and recording it is what keeps
// the staleness check honest.
function isUnchanged(
  latest: ProspectValuation,
  modelId: string,
  result: ValuationResult,
  slotAlumniPlayerIds: string[]
): boolean {
  return (
    latest.modelId === modelId &&
    latest.projectedDraftSlot === result.projectedDraftSlot &&
    latest.projectedValueUsd === result.projectedValueUsd &&
    latest.projectedValueLowUsd === result.projectedValueLowUsd &&
    latest.projectedValueHighUsd === result.projectedValueHighUsd &&
    latest.levelFactor === result.levelFactor &&
    sameList(latest.comparablePlayerIds, result.comparablePlayerIds) &&
    sameList(latest.slotAlumniPlayerIds, slotAlumniPlayerIds) &&
    JSON.stringify(latest.drivers) === JSON.stringify(result.drivers)
  );
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
