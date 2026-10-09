import { z } from "zod";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";

// Validation and slimming for ESPN's injury report: the only place that knows
// its field names. The ~1.3 MB report carries a full athlete record (links,
// headshots, positions) per injury; this keeps the ten fields the pages show.
//
// Validation is per team and per injury, so one odd entry is dropped rather
// than blanking the page. A report where entries exist but NONE match is a
// changed format, and is rejected outright as unavailable.

/** How serious ESPN rates an injury, from its status type. */
export type InjurySeverity = "OUT" | "DAY_TO_DAY" | "OTHER";

const SEVERITY_BY_STATUS_TYPE: Record<string, InjurySeverity> = {
  INJURY_STATUS_OUT: "OUT",
  INJURY_STATUS_DAYTODAY: "DAY_TO_DAY",
};

// What ESPN writes for a side it doesn't know.
const UNKNOWN_SIDE = "Not Specified";
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One injury as ESPN reports it, before it is matched to this app's teams and players. */
export interface EspnInjury {
  /** ESPN's team name, e.g. "LA Clippers". */
  espnTeamName: string;
  /** The player's name as ESPN spells it. */
  playerName: string;
  /** ESPN's own wording, e.g. "Out" or "Day-To-Day". */
  status: string;
  severity: InjurySeverity;
  /** e.g. "Knee"; null when ESPN doesn't say. */
  bodyPart: string | null;
  /** "Left" or "Right"; null when ESPN doesn't say. */
  side: string | null;
  /** The diagnosis, e.g. "Tendinitis". */
  detail: string | null;
  /** ESPN's estimated return, as a calendar date ("2026-10-10"). An estimate, not an official date. */
  expectedReturn: string | null;
  /** ESPN's one-paragraph summary, usually crediting the reporter. */
  note: string | null;
  /** When ESPN last updated this entry, UTC ISO 8601. */
  updatedAt: string | null;
}

const reportSchema = z.object({ injuries: z.array(z.unknown()) });

const teamSchema = z.object({
  displayName: z.string().min(1),
  injuries: z.array(z.unknown()),
});

const injurySchema = z.object({
  status: z.string().min(1),
  date: z.string().nullish(),
  shortComment: z.string().nullish(),
  type: z.object({ name: z.string() }).nullish(),
  details: z
    .object({
      type: z.string().nullish(),
      side: z.string().nullish(),
      detail: z.string().nullish(),
      returnDate: z.string().nullish(),
    })
    .nullish(),
  athlete: z.object({ displayName: z.string().min(1) }),
});

type RawInjury = z.infer<typeof injurySchema>;

/**
 * Parses ESPN's league-wide injury report into one EspnInjury per entry.
 *
 * @param report - the report's JSON, as read from the feed.
 * @returns every valid entry, in ESPN's order (team by team).
 * @throws InjuryFeedUnavailableError when the report's outer shape is wrong,
 *   or when it has entries and none of them can be read.
 */
export function parseEspnInjuryReport(report: unknown): EspnInjury[] {
  const parsedReport = reportSchema.safeParse(report);
  if (!parsedReport.success) {
    throw new InjuryFeedUnavailableError("ESPN's injury report has no list of teams; its format may have changed");
  }

  const injuries: EspnInjury[] = [];
  let entryCount = 0;
  for (const rawTeam of parsedReport.data.injuries) {
    const team = teamSchema.safeParse(rawTeam);
    if (!team.success) continue;
    for (const rawInjury of team.data.injuries) {
      entryCount += 1;
      const injury = injurySchema.safeParse(rawInjury);
      if (injury.success) injuries.push(toEspnInjury(team.data.displayName, injury.data));
    }
  }

  if (entryCount > 0 && injuries.length === 0) {
    throw new InjuryFeedUnavailableError("None of the entries in ESPN's injury report could be read; its format may have changed");
  }
  return injuries;
}

function toEspnInjury(espnTeamName: string, raw: RawInjury): EspnInjury {
  const details = raw.details ?? {};
  return {
    espnTeamName,
    playerName: raw.athlete.displayName,
    status: raw.status,
    severity: SEVERITY_BY_STATUS_TYPE[raw.type?.name ?? ""] ?? "OTHER",
    bodyPart: details.type || null,
    side: details.side && details.side !== UNKNOWN_SIDE ? details.side : null,
    detail: details.detail || null,
    expectedReturn: details.returnDate && CALENDAR_DATE_PATTERN.test(details.returnDate) ? details.returnDate : null,
    note: raw.shortComment || null,
    updatedAt: toIsoTimestamp(raw.date),
  };
}

/** ESPN writes "2026-10-09T02:30Z"; this normalises it, or returns null if it isn't a date. */
function toIsoTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
