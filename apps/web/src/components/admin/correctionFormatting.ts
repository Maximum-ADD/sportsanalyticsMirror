// How a correction's fields and stat changes read to an admin, shared by
// the preview and the history table: names instead of ids, "made" instead
// of true, "Q2 7:45" instead of 2 / "PT07M45.00S".
import type { CorrectableEventFields } from "@/lib/adminApi";
import { formatGameClock } from "@/lib/gameClock";
import { formatEventType, formatPeriod } from "./playCorrection";

const FIELD_LABELS: Record<keyof CorrectableEventFields, string> = {
  period: "Quarter",
  clock: "Clock",
  eventType: "Play type",
  subType: "Detail",
  playerId: "Player",
  teamId: "Team",
  success: "Made/missed",
  value: "Value",
  description: "Description",
};

const STAT_LABELS: Record<string, string> = {
  points: "PTS",
  fieldGoalsMade: "FGM",
  fieldGoalsAttempted: "FGA",
  threesMade: "3PM",
  threesAttempted: "3PA",
  freeThrowsMade: "FTM",
  freeThrowsAttempted: "FTA",
  offensiveRebounds: "OREB",
  defensiveRebounds: "DREB",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TOV",
};

const EMPTY_VALUE = "—";

/** Names to show in place of the ids a correction stores. */
export interface CorrectionNameLookup {
  playerNames: Record<string, string>;
  teamNames: Record<string, string>;
}

export function formatFieldLabel(field: string): string {
  return FIELD_LABELS[field as keyof CorrectableEventFields] ?? field;
}

export function formatStatLabel(field: string): string {
  return STAT_LABELS[field] ?? field;
}

/** One stored value of a correctable field, as an admin reads it. */
export function formatCorrectionValue(field: string, value: unknown, names: CorrectionNameLookup): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  switch (field) {
    case "playerId":
      return names.playerNames[String(value)] ?? String(value);
    case "teamId":
      return names.teamNames[String(value)] ?? String(value);
    case "success":
      return value === true ? "made" : "missed";
    case "clock":
      return formatGameClock(String(value));
    case "period":
      return formatPeriod(Number(value));
    case "eventType":
      return formatEventType(String(value));
    default:
      return String(value);
  }
}

/** A stored stat value, where null means "never recorded". */
export function formatStatValue(value: number | null): string {
  return value === null ? EMPTY_VALUE : String(value);
}
