import type { InjurySeverity, PlayerInjury } from "./injuriesApi";

// How injuries read on the page, shared by the team section and the player
// badge so both word and colour an injury the same way.

/** The credit every injury display carries: the data is ESPN's, not the NBA's or this app's. */
export const INJURY_SOURCE_CREDIT = "Injury data: ESPN";

const SEVERITY_LABEL: Record<InjurySeverity, string> = {
  OUT: "Out",
  DAY_TO_DAY: "Day-to-day",
  OTHER: "",
};

// Out reads as the app's "bad" red; day-to-day as the amber the datasets
// page uses for a stale release; anything else stays neutral.
const SEVERITY_PILL_CLASS: Record<InjurySeverity, string> = {
  OUT: "bg-locker-bad text-white",
  DAY_TO_DAY: "bg-yellow-100 text-yellow-800",
  OTHER: "border border-landing-light text-locker-ink-muted",
};

/** The status as a short label: "Out", "Day-to-day", or ESPN's own wording for anything else. */
export function formatInjuryStatus(injury: Pick<PlayerInjury, "severity" | "status">): string {
  return SEVERITY_LABEL[injury.severity] || injury.status;
}

export function getSeverityPillClass(severity: InjurySeverity): string {
  return SEVERITY_PILL_CLASS[severity];
}

/**
 * Describes the injury itself: "Left knee · Tendinitis". Drops whatever
 * ESPN left out, and returns null when it gave no detail at all.
 */
export function formatInjuryDescription(injury: Pick<PlayerInjury, "side" | "bodyPart" | "detail">): string | null {
  const location = [injury.side, injury.bodyPart?.toLowerCase()].filter(Boolean).join(" ");
  const capitalisedLocation = location ? location[0].toUpperCase() + location.slice(1) : "";
  const parts = [capitalisedLocation, injury.detail].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Formats a calendar date ("2026-10-10") as "10 Oct 2026". Read in UTC, since
 * a bare date parses as UTC midnight and a local time zone west of Greenwich
 * would otherwise show the day before.
 */
export function formatInjuryDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Expected return 10 Oct 2026 (ESPN estimate)", or null when ESPN gave no date. */
export function formatExpectedReturn(expectedReturn: string | null): string | null {
  return expectedReturn ? `Expected return ${formatInjuryDate(expectedReturn)} (ESPN estimate)` : null;
}
