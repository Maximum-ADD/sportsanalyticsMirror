import type { Team } from "@prisma/client";

/**
 * The slice of a Team this module ever puts in a response: enough to render a
 * crest and a label, nothing more. Both the watchlist (a followed player's
 * club) and the team-results feed (your team and its opponent) project through
 * here, so a team looks identical wherever the home page shows one.
 */
export interface TeamSummary {
  id: string;
  // The nba.com team id, alongside our own uuid. Not an alternative key —
  // every route still addresses a team by `id`. It is here because the crest
  // the frontend draws is built from this id (cdn.nba.com serves logos at a
  // path keyed on it), and without it the home page can only render a
  // coloured abbreviation where the rest of the app shows a real logo.
  nbaTeamId: number;
  name: string;
  city: string;
  abbreviation: string;
  logoUrl: string | null;
}

/**
 * Projects a full Team row down to the fields the home page renders.
 *
 * @param team - the Team row to project.
 * @returns the summary. logoUrl stays nullable: not every team row has one,
 *          and an absent crest is the frontend's problem, not a reason to
 *          substitute a fake URL.
 */
export function toTeamSummary(team: Team): TeamSummary {
  return {
    id: team.id,
    nbaTeamId: team.nbaTeamId,
    name: team.name,
    city: team.city,
    abbreviation: team.abbreviation,
    logoUrl: team.logoUrl,
  };
}

/**
 * The same projection for a relation that may legitimately be absent — a
 * Player whose teamId is null (unsigned, or not yet matched to a roster).
 *
 * @param team - the Team row, or null when the player has no current club.
 * @returns the summary, or null — the absence is passed straight through.
 */
export function toOptionalTeamSummary(team: Team | null): TeamSummary | null {
  return team ? toTeamSummary(team) : null;
}
