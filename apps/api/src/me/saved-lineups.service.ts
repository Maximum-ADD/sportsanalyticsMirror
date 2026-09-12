import { HttpStatus, Injectable } from "@nestjs/common";
import type { Player, PlayerPrediction, SavedLineup, SavedLineupSlot } from "@prisma/client";
import { ApiException } from "../common/api-exception.js";
import type { PlayerWithTeam } from "../players/players.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Mirror of the MILP constraints in apps/optimizer/optimize.py — keep these
// equal to the solver's own constants. The API refuses to save exactly the
// boards the solver would refuse to solve, and eligibility uses the same
// substring test as the Python ("G" in position), so a combo guard like
// "G-F" counts toward both the guard and the forward minimums.
const LINEUP_SIZE = 5;
const MINIMUM_GUARDS = 1;
const MINIMUM_FORWARDS = 1;

export interface SaveLineupSlotInput {
  playerId: string;
  predictedPointsAtSave: number;
  salaryAtSave: number;
}

export interface SaveLineupInput {
  budget: number;
  // Required: every saved lineup gets a name so a profile full of saves
  // stays findable. (The column stays nullable only for rows saved before
  // the name existed.)
  name: string;
  slots: SaveLineupSlotInput[];
}

export interface SavedLineupSlotSummary {
  id: string;
  playerId: string;
  player: PlayerWithTeam;
  predictedPointsAtSave: number;
  salaryAtSave: number;
  currentPredictedFantasyPoints: number | null;
  currentSalary: number | null;
}

export interface SavedLineupDrift {
  pointsDelta: number;
  salaryDelta: number;
  isOverBudget: boolean;
}

export interface SavedLineupSummary {
  id: string;
  budget: number;
  name: string | null;
  createdAt: Date;
  totalPredictedPointsAtSave: number;
  totalSalaryAtSave: number;
  drift: SavedLineupDrift | null;
  slots: SavedLineupSlotSummary[];
}

type SavedLineupWithSlots = SavedLineup & {
  slots: (SavedLineupSlot & { player: PlayerWithTeam })[];
};

function invalidLineup(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LINEUP", message);
}

// PlayerPrediction values are floats; sums drift on the order of 1e-10, and a
// drift sentence like "up 4.600000000000001 points" is a bug report, not a
// number. One decimal place matches how fantasy points are displayed.
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Enforces the solver's constraints on a proposed save, in the same spirit
 * as optimize.py: roster size, no duplicate picks, the position minimums,
 * and the salary cap. Runs before any write so a rejected board leaves no
 * partial rows behind.
 *
 * @param input - the board being saved, slots and budget verbatim.
 * @param playersById - every Player row the slots reference, keyed by id.
 * @throws ApiException 400 INVALID_LINEUP naming the first rule the board breaks.
 */
export function assertMeetsSolverConstraints(
  input: SaveLineupInput,
  playersById: ReadonlyMap<string, Pick<Player, "id" | "position">>
): void {
  if (input.slots.length !== LINEUP_SIZE) {
    throw invalidLineup(
      `A lineup must have exactly ${LINEUP_SIZE} players (the solver's roster size), but this one has ${input.slots.length}`
    );
  }

  const uniquePlayerIds = new Set(input.slots.map((slot) => slot.playerId));
  if (uniquePlayerIds.size !== input.slots.length) {
    throw invalidLineup("The same player appears more than once — the solver picks each player at most once");
  }

  for (const slot of input.slots) {
    if (!playersById.has(slot.playerId)) {
      throw invalidLineup(`Lineup references a player that doesn't exist (${slot.playerId})`);
    }
  }

  const positionsOf = (slot: SaveLineupSlotInput): string => playersById.get(slot.playerId)!.position;
  const guardCount = input.slots.filter((slot) => positionsOf(slot).includes("G")).length;
  if (guardCount < MINIMUM_GUARDS) {
    throw invalidLineup(
      `The lineup needs at least ${MINIMUM_GUARDS} guard — a position containing "G", the same substring test the solver uses`
    );
  }
  const forwardCount = input.slots.filter((slot) => positionsOf(slot).includes("F")).length;
  if (forwardCount < MINIMUM_FORWARDS) {
    throw invalidLineup(
      `The lineup needs at least ${MINIMUM_FORWARDS} forward — a position containing "F", the same substring test the solver uses`
    );
  }

  const totalSalary = input.slots.reduce((sum, slot) => sum + slot.salaryAtSave, 0);
  if (totalSalary > input.budget) {
    throw invalidLineup(
      `The lineup's $${totalSalary.toLocaleString("en-US")} salary is $${(totalSalary - input.budget).toLocaleString(
        "en-US"
      )} over the $${input.budget.toLocaleString("en-US")} cap`
    );
  }
}

/**
 * Measures how far a saved lineup has drifted from the numbers it froze at
 * save time: latest prediction minus frozen, per slot summed.
 *
 * @returns null when any slot's player has no prediction on record — zero is
 *          not what the pipeline says about that player, it says nothing at
 *          all, and inventing a value would fabricate movement on the next
 *          read. Callers render "no current prediction" instead of a delta.
 */
export function deriveLineupDrift(
  savedLineup: Pick<SavedLineup, "budget"> & {
    slots: Pick<SavedLineupSlot, "playerId" | "predictedPointsAtSave" | "salaryAtSave">[];
  },
  latestPredictionByPlayerId: ReadonlyMap<string, Pick<PlayerPrediction, "playerId" | "predictedFantasyPoints" | "salary">>
): SavedLineupDrift | null {
  let currentPredictedPoints = 0;
  let currentSalary = 0;
  for (const slot of savedLineup.slots) {
    const latest = latestPredictionByPlayerId.get(slot.playerId);
    if (!latest) {
      return null;
    }
    currentPredictedPoints += latest.predictedFantasyPoints;
    currentSalary += latest.salary;
  }

  const savedPredictedPoints = savedLineup.slots.reduce((sum, slot) => sum + slot.predictedPointsAtSave, 0);
  const savedSalary = savedLineup.slots.reduce((sum, slot) => sum + slot.salaryAtSave, 0);

  return {
    pointsDelta: roundToTenth(currentPredictedPoints - savedPredictedPoints),
    salaryDelta: currentSalary - savedSalary,
    isOverBudget: currentSalary > savedLineup.budget,
  };
}

function summarizeSavedLineup(
  savedLineup: SavedLineupWithSlots,
  latestPredictionByPlayerId: ReadonlyMap<string, PlayerPrediction>
): SavedLineupSummary {
  return {
    id: savedLineup.id,
    budget: savedLineup.budget,
    name: savedLineup.name,
    createdAt: savedLineup.createdAt,
    totalPredictedPointsAtSave: roundToTenth(
      savedLineup.slots.reduce((sum, slot) => sum + slot.predictedPointsAtSave, 0)
    ),
    totalSalaryAtSave: savedLineup.slots.reduce((sum, slot) => sum + slot.salaryAtSave, 0),
    drift: deriveLineupDrift(savedLineup, latestPredictionByPlayerId),
    slots: savedLineup.slots.map((slot) => ({
      id: slot.id,
      playerId: slot.playerId,
      player: slot.player,
      predictedPointsAtSave: slot.predictedPointsAtSave,
      salaryAtSave: slot.salaryAtSave,
      currentPredictedFantasyPoints: latestPredictionByPlayerId.get(slot.playerId)?.predictedFantasyPoints ?? null,
      currentSalary: latestPredictionByPlayerId.get(slot.playerId)?.salary ?? null,
    })),
  };
}

@Injectable()
export class SavedLineupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads the user's saved lineups, newest first, each annotated with the
   * current latest prediction per slot so the client can show drift.
   *
   * @param userId - the signed-in user; other users' lineups are invisible.
   */
  async listSavedLineups(userId: string): Promise<SavedLineupSummary[]> {
    const savedLineups = await this.prisma.savedLineup.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { slots: { include: { player: { include: { team: true } } } } },
    });

    const latestPredictionByPlayerId = await this.findLatestPredictions(savedLineups);
    return savedLineups.map((savedLineup) => summarizeSavedLineup(savedLineup, latestPredictionByPlayerId));
  }

  /**
   * Freezes the given board as a SavedLineup. The slot values are stored
   * verbatim — they are what the board showed, not a re-lookup — so later
   * optimizer runs can never rewrite what the user saved.
   *
   * @param userId - the owner; there is deliberately no way to save for someone else.
   * @param input - the board being saved, already shape-checked by the controller.
   * @throws ApiException 400 INVALID_LINEUP when the board breaks a solver constraint.
   */
  async saveLineup(userId: string, input: SaveLineupInput): Promise<SavedLineupSummary> {
    const players = await this.prisma.player.findMany({
      where: { id: { in: input.slots.map((slot) => slot.playerId) } },
    });
    const playersById = new Map(players.map((player) => [player.id, player]));
    assertMeetsSolverConstraints(input, playersById);

    const created = await this.prisma.savedLineup.create({
      data: {
        userId,
        budget: input.budget,
        name: input.name,
        slots: {
          create: input.slots.map((slot) => ({
            playerId: slot.playerId,
            predictedPointsAtSave: slot.predictedPointsAtSave,
            salaryAtSave: slot.salaryAtSave,
          })),
        },
      },
      include: { slots: { include: { player: { include: { team: true } } } } },
    });

    const latestPredictionByPlayerId = await this.findLatestPredictions([created]);
    return summarizeSavedLineup(created, latestPredictionByPlayerId);
  }

  /**
   * Idempotent by design, matching MeService.unfollowPlayer — deleting a
   * lineup that isn't (or is no longer) the user's is a no-op success, since
   * the caller only cares about the end state ("this lineup is gone"). The
   * userId scoping also makes one user's delete incapable of touching
   * another user's row.
   */
  async deleteSavedLineup(userId: string, lineupId: string): Promise<void> {
    await this.prisma.savedLineup.deleteMany({ where: { id: lineupId, userId } });
  }

  // Latest-by-asOf prediction per player, the same take-latest rule as
  // /v1/optimizer/lineup. Ordered desc so the first row seen per player is
  // the newest; predictions are few enough that fetching all and deduping in
  // memory is cheaper than one query per player.
  private async findLatestPredictions(
    savedLineups: SavedLineupWithSlots[]
  ): Promise<Map<string, PlayerPrediction>> {
    const playerIds = [...new Set(savedLineups.flatMap((savedLineup) => savedLineup.slots.map((slot) => slot.playerId)))];
    if (playerIds.length === 0) {
      return new Map();
    }

    const predictions = await this.prisma.playerPrediction.findMany({
      where: { playerId: { in: playerIds } },
      orderBy: { asOf: "desc" },
    });
    const latestByPlayerId = new Map<string, PlayerPrediction>();
    for (const prediction of predictions) {
      if (!latestByPlayerId.has(prediction.playerId)) {
        latestByPlayerId.set(prediction.playerId, prediction);
      }
    }
    return latestByPlayerId;
  }
}
