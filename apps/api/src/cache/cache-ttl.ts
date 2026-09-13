// How long each kind of cached read stays fresh. Every figure the public API
// serves is written by a batch job (apps/ingestion, apps/predictor,
// apps/optimizer), never by a request, so the API can't know when that data
// changes. A short TTL is what bounds how stale it can get: a batch run shows
// up on the site within DERIVED_DATA_TTL_MS at the latest.

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

// Teams and the list of seasons: they change only when a new season or
// franchise is ingested, a few times a year.
export const REFERENCE_DATA_TTL_MS = 60 * MILLISECONDS_PER_MINUTE;

// Games, boxscore-derived stats, predictions, Elo ratings and lineups: they
// change whenever a batch job runs.
export const DERIVED_DATA_TTL_MS = 5 * MILLISECONDS_PER_MINUTE;

// Figures that move when users act, such as the leaderboard's pick counts.
// Kept short, and a user's own write also invalidates it directly (see
// PicksService.createPick).
export const USER_ACTIVITY_TTL_MS = 60 * MILLISECONDS_PER_SECOND;
