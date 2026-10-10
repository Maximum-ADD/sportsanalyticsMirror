// Display helpers for the bio fields a Player carries (see player_bios.py for
// where they come from). They live here rather than on a page because the
// profile page and the compare page both render the same fields and had
// drifted into keeping their own copies of this formatting.

// Rendered wherever a value is genuinely absent. Shared so a dash on the
// profile page and a dash on the compare page are the same character.
export const NO_VALUE = "—";

/**
 * Whole years elapsed between `birthDate` and today.
 *
 * Age isn't stored anywhere — CommonPlayerInfo doesn't provide it directly,
 * and it would go stale the moment it was saved (unlike birthDate, which
 * never changes). Computed fresh on every call instead.
 *
 * @param birthDate ISO date string, or null for a player whose bio hasn't
 *   been ingested yet.
 * @returns The age in years, or null when `birthDate` is null. A birthday
 *   falling today counts as already reached.
 */
export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let ageInYears = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) ageInYears -= 1;
  return ageInYears;
}

/**
 * Formats a player's age for display, e.g. "40".
 *
 * @param birthDate ISO date string, or null.
 * @returns The age in years as a string, or NO_VALUE when there is no
 *   birthDate to compute it from.
 */
export function formatAge(birthDate: string | null): string {
  const ageInYears = calculateAge(birthDate);
  return ageInYears === null ? NO_VALUE : `${ageInYears}`;
}

/**
 * Formats a height in inches as feet and inches, e.g. 81 -> `6'9"`.
 *
 * @param heightInches Total height in inches, or null when unknown.
 * @returns The formatted height, or NO_VALUE when `heightInches` is null.
 */
export function formatHeight(heightInches: number | null): string {
  if (heightInches === null) return NO_VALUE;
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

// The roster feed abbreviates every position, and hyphenates the hybrids:
// the full set in the data is C, C-F, F, F-C, F-G, G, G-F.
const POSITION_NAMES: Record<string, string> = {
  G: "Guard",
  F: "Forward",
  C: "Center",
};

/**
 * Expands a roster position code into words.
 *
 * Hybrids are expanded on each side and re-joined, so "G-F" reads
 * "Guard-Forward" and the order the feed gives — which puts the primary
 * position first — is preserved rather than normalised away.
 *
 * @param position The code from Player.position, e.g. "F" or "G-F".
 * @returns The expanded name, or the original string for any code not in
 *   the map. Returning the input rather than a dash matters: an
 *   unrecognised code is still more useful to a reader than nothing, and
 *   silently blanking it would hide a feed change instead of surfacing it.
 */
export function formatPosition(position: string | null | undefined): string {
  if (!position) return NO_VALUE;
  return position
    .split("-")
    .map((part) => POSITION_NAMES[part.trim().toUpperCase()] ?? part.trim())
    .join("-");
}
