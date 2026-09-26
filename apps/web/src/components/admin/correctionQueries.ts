import type { QueryClient } from "@tanstack/react-query";

export const ADMIN_PLAY_BY_PLAY_QUERY_KEY = "adminPlayByPlay";
export const ADMIN_GAMES_QUERY_KEY = "adminGames";
export const ADMIN_CORRECTIONS_QUERY_KEY = "adminCorrections";

// Reads a correction can change outside the admin page: game lists and
// detail, the datasets page (a release goes stale), and every player-stat
// read (their query keys all start with "player").
const AFFECTED_PUBLIC_QUERY_KEYS = ["games", "gameDetail", "datasetReleases"];
const PLAYER_QUERY_KEY_PREFIX = "player";

/**
 * Refetches everything a correction, undo or recalculation of `gameId`
 * can have changed: its play-by-play, the correction history, the admin
 * game list's counts, and the public game, player and dataset reads.
 */
export async function refreshAfterCorrection(queryClient: QueryClient, gameId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [ADMIN_PLAY_BY_PLAY_QUERY_KEY, gameId] }),
    queryClient.invalidateQueries({ queryKey: [ADMIN_CORRECTIONS_QUERY_KEY] }),
    queryClient.invalidateQueries({ queryKey: [ADMIN_GAMES_QUERY_KEY] }),
    ...AFFECTED_PUBLIC_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    queryClient.invalidateQueries({
      predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(PLAYER_QUERY_KEY_PREFIX),
    }),
  ]);
}

/** What the admin is told after a correction or undo is saved. */
export interface CorrectionSavedNotice {
  message: string;
  season: string;
  releasesMarkedStale: number;
}
