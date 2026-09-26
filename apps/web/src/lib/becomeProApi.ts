// Every Become Pro endpoint, in the shape lib/nbaApi.ts and lib/meApi.ts
// already use: a bare async function per route, no hooks, callers wire their
// own useQuery/useMutation at the call site.
//
// All of them are the signed-in user's own data under /v1/me/become-pro:
// Become Pro is private to each user, so there is no public read.
//
// Keeping every call behind this one module is what makes the feature
// testable without a backend: each spec replaces the module wholesale with
// vi.mock.

import type { QueryClient } from "@tanstack/react-query";
import { fetchJson, sendJson } from "./apiClient";
import { toQueryString } from "./nbaApi";
import type {
  CreateProspectSeasonBody,
  MyBecomePro,
  MyBecomeProSummary,
  ProspectGame,
  ProspectGameInput,
  ProspectSeason,
} from "@/types/nba";

// ── Query keys ────────────────────────────────────────────────────────────
// Exported rather than written inline: three surfaces (the Become Pro page,
// the Home card and the Profile card) all go stale after the same writes, and
// a typo in one key would leave an old value on screen with nothing failing.

export const MY_BECOME_PRO_QUERY_KEY = ["myBecomePro"];
export const MY_BECOME_PRO_SUMMARY_QUERY_KEY = ["myBecomeProSummary"];

/**
 * Refetch everything a write to the user's own seasons can change.
 *
 * Mirrors lib/preferenceQueries.ts's invalidatePreferenceQueries: one helper
 * every mutation calls, so logging a game updates the page, the Home card and
 * the Profile card without each call site remembering the list.
 */
export async function invalidateBecomeProQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    [MY_BECOME_PRO_QUERY_KEY, MY_BECOME_PRO_SUMMARY_QUERY_KEY].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  );
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** The whole Become Pro page; empty (not an error) before a season exists. */
export function fetchMyBecomePro(seasonId?: string): Promise<MyBecomePro> {
  return fetchJson<MyBecomePro>(`/v1/me/become-pro${toQueryString({ seasonId })}`);
}

/** A figure and a trend for the Home and Profile cards. */
export function fetchMyBecomeProSummary(): Promise<MyBecomeProSummary> {
  return fetchJson<MyBecomeProSummary>("/v1/me/become-pro/summary");
}

// ── Seasons ───────────────────────────────────────────────────────────────

export function createProspectSeason(body: CreateProspectSeasonBody): Promise<ProspectSeason> {
  return sendJson<ProspectSeason>("/v1/me/become-pro/seasons", "POST", body);
}

export function updateProspectSeason(
  seasonId: string,
  body: Partial<CreateProspectSeasonBody>
): Promise<ProspectSeason> {
  return sendJson<ProspectSeason>(`/v1/me/become-pro/seasons/${seasonId}`, "PATCH", body);
}

export function deleteProspectSeason(seasonId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/me/become-pro/seasons/${seasonId}`, "DELETE");
}

// ── Games ─────────────────────────────────────────────────────────────────
// Every one of these re-values the season on the server before it returns,
// so a refetch straight after shows the current figure.

export function createProspectGame(seasonId: string, body: ProspectGameInput): Promise<ProspectGame> {
  return sendJson<ProspectGame>(`/v1/me/become-pro/seasons/${seasonId}/games`, "POST", body);
}

export function updateProspectGame(gameId: string, body: Partial<ProspectGameInput>): Promise<ProspectGame> {
  return sendJson<ProspectGame>(`/v1/me/become-pro/games/${gameId}`, "PATCH", body);
}

export function deleteProspectGame(gameId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/me/become-pro/games/${gameId}`, "DELETE");
}
