import type { SeasonType } from "@/types/nba";

// One place deciding how season segments are ordered, labelled and written
// into the URL, so the profile page, the players list and the games list
// can't drift into calling the same segment different things.

// Chronological, which is also how a season is read: regular season, then
// the play-in, then the playoffs, then the Finals. Every segment selector
// renders in this order.
export const SEASON_TYPES_IN_ORDER: SeasonType[] = ["REGULAR", "PLAY_IN", "PLAYOFFS", "FINALS"];

export const DEFAULT_SEASON_TYPE: SeasonType = "REGULAR";

const SEASON_TYPE_LABELS: Record<SeasonType, string> = {
  REGULAR: "Regular Season",
  PLAY_IN: "Play-In",
  PLAYOFFS: "Playoffs",
  FINALS: "Finals",
};

// Shorter forms for tight spots (segment buttons, table column headers)
// where the full label would wrap or crowd out the numbers beside it.
const SEASON_TYPE_SHORT_LABELS: Record<SeasonType, string> = {
  REGULAR: "Regular",
  PLAY_IN: "Play-In",
  PLAYOFFS: "Playoffs",
  FINALS: "Finals",
};

export function formatSeasonType(seasonType: SeasonType): string {
  return SEASON_TYPE_LABELS[seasonType];
}

export function formatSeasonTypeShort(seasonType: SeasonType): string {
  return SEASON_TYPE_SHORT_LABELS[seasonType];
}

// The URL spelling of a segment: lowercase and hyphenated ("?segment=play-in")
// rather than the API's SCREAMING_SNAKE enum, since this ends up in a link
// someone might share or read.
const URL_SEGMENT_BY_SEASON_TYPE: Record<SeasonType, string> = {
  REGULAR: "regular",
  PLAY_IN: "play-in",
  PLAYOFFS: "playoffs",
  FINALS: "finals",
};

const SEASON_TYPE_BY_URL_SEGMENT: Record<string, SeasonType> = Object.fromEntries(
  Object.entries(URL_SEGMENT_BY_SEASON_TYPE).map(([seasonType, urlSegment]) => [urlSegment, seasonType as SeasonType])
);

export function toUrlSegment(seasonType: SeasonType): string {
  return URL_SEGMENT_BY_SEASON_TYPE[seasonType];
}

// Views that can show the whole season at once — the games list, where a
// schedule running chronologically from October through the Finals is the
// useful thing rather than a bleed, since nothing there is averaged across
// segments. The player views deliberately have no such option: an average
// mixing regular-season and playoff games is exactly what this feature
// exists to prevent.
export const ALL_SEGMENTS = "ALL";
export type SeasonSegmentSelection = SeasonType | typeof ALL_SEGMENTS;

const ALL_SEGMENTS_URL_VALUE = "all";

export function toUrlSegmentSelection(selection: SeasonSegmentSelection): string {
  return selection === ALL_SEGMENTS ? ALL_SEGMENTS_URL_VALUE : toUrlSegment(selection);
}

/**
 * Reads a `?segment=` value for a view that supports showing every segment.
 *
 * Defaults to ALL when absent, matching the games endpoint's own default of
 * no filter — so an unparameterised games page and an unparameterised
 * request agree on what they mean.
 */
export function parseUrlSegmentSelection(urlSegment: string | null): SeasonSegmentSelection {
  if (!urlSegment || urlSegment === ALL_SEGMENTS_URL_VALUE) return ALL_SEGMENTS;
  return SEASON_TYPE_BY_URL_SEGMENT[urlSegment] ?? ALL_SEGMENTS;
}

// The seasonType to send to the API for a selection — undefined for ALL,
// since the games endpoint treats an absent seasonType as "every segment".
export function toSeasonTypeParam(selection: SeasonSegmentSelection): SeasonType | undefined {
  return selection === ALL_SEGMENTS ? undefined : selection;
}

/**
 * Reads a `?segment=` value back into a SeasonType.
 *
 * Falls back to the regular season for anything unrecognised — a
 * hand-edited or stale URL should land somewhere sensible rather than
 * blanking the page. That's a safe default here, unlike in the API, where
 * an unrecognised segment is a 400: this only decides which of four valid
 * requests to make, and the request itself still carries an exact segment.
 */
export function parseUrlSegment(urlSegment: string | null): SeasonType {
  if (!urlSegment) return DEFAULT_SEASON_TYPE;
  return SEASON_TYPE_BY_URL_SEGMENT[urlSegment] ?? DEFAULT_SEASON_TYPE;
}

// Postseason segments are 1-20 games, so a shooting percentage from one of
// them can swing wildly on a handful of attempts. Below this many games the
// UI de-emphasizes rate stats rather than presenting them with the same
// confidence as an 82-game figure.
export const SMALL_SAMPLE_GAME_THRESHOLD = 4;

export function isSmallSample(gamesPlayed: number): boolean {
  return gamesPlayed > 0 && gamesPlayed < SMALL_SAMPLE_GAME_THRESHOLD;
}
