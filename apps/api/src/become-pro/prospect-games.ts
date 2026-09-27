import type { ProspectGame } from "@prisma/client";
import type { DerivableGameStat } from "../players/season-averages.js";

/**
 * One self-reported game in the shape the shared season-line derivation reads.
 *
 * The four advanced figures an amateur box score cannot carry are null rather
 * than 0: the derivation treats null as "no basis to report", which is exactly
 * right here, while a zero would be a real measurement (an even plus/minus, a
 * 0% usage rate) that nobody made.
 */
export function toDerivableGame(game: ProspectGame): DerivableGameStat {
  return {
    minutes: game.minutes,
    points: game.points,
    rebounds: game.rebounds,
    assists: game.assists,
    steals: game.steals,
    blocks: game.blocks,
    turnovers: game.turnovers,
    fieldGoalsMade: game.fieldGoalsMade,
    fieldGoalsAttempted: game.fieldGoalsAttempted,
    threesMade: game.threesMade,
    threesAttempted: game.threesAttempted,
    freeThrowsMade: game.freeThrowsMade,
    freeThrowsAttempted: game.freeThrowsAttempted,
    plusMinus: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
  };
}
