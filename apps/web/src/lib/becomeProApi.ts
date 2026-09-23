// Every Become Pro endpoint, in the shape lib/nbaApi.ts and lib/meApi.ts
// already use: a bare async function per route, no hooks, callers wire their
// own useQuery/useMutation at the call site.
//
// Keeping all of them behind this one module is what makes the feature
// buildable before the backend is: every spec replaces this module wholesale
// with vi.mock, so no component in the feature has ever touched a real fetch.

import type { QueryClient } from "@tanstack/react-query";
import { fetchJson, postFormData, sendJson } from "./apiClient";
import { toQueryString } from "./nbaApi";
import type {
  AdminProspectEvidence,
  CompetitionLevel,
  CreateProspectSeasonBody,
  EvidenceStatus,
  PagedResult,
  ProspectDirectoryEntry,
  ProspectEvidence,
  ProspectGame,
  ProspectGameInput,
  ProspectLeaderboard,
  ProspectProfile,
  ProspectRankSummary,
  ProspectSeason,
} from "@/types/nba";

// ── Query keys ────────────────────────────────────────────────────────────
// Exported rather than written inline at each call site, unlike most of this
// app: four separate surfaces (the header badge, Home, Profile and the two
// pages) invalidate the same keys after a mutation, and a typo in one of them
// would leave a stale rank on screen with nothing failing.

export const PROSPECT_RANK_QUERY_KEY = ["prospectRank"];
export const PROSPECT_LEADERBOARD_QUERY_KEY = ["prospectLeaderboard"];
export const PROSPECT_DIRECTORY_QUERY_KEY = ["prospectDirectory"];

export function prospectQueryKey(username: string) {
  return ["prospect", username];
}

/**
 * Refetch everything a write to a prospect's own season can change.
 *
 * Mirrors lib/preferenceQueries.ts's invalidatePreferenceQueries: one helper
 * every mutation calls, so logging a game updates the header badge and the
 * board without a reload and without each call site remembering the full list.
 */
export async function invalidateProspectQueries(
  queryClient: QueryClient,
  username?: string | null
): Promise<void> {
  const keys = [
    PROSPECT_RANK_QUERY_KEY,
    PROSPECT_LEADERBOARD_QUERY_KEY,
    PROSPECT_DIRECTORY_QUERY_KEY,
    ...(username ? [prospectQueryKey(username)] : []),
  ];
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

// ── Public reads ──────────────────────────────────────────────────────────

export interface FetchProspectLeaderboardParams {
  page?: number;
  pageSize?: number;
  search?: string;
  level?: CompetitionLevel;
}

export function fetchProspectLeaderboard(
  params: FetchProspectLeaderboardParams = {}
): Promise<ProspectLeaderboard> {
  return fetchJson<ProspectLeaderboard>(`/v1/become-pro/leaderboard${toQueryString(params)}`);
}

// Everyone with a public season, ranked or not. Deliberately separate from the
// leaderboard: a prospect below the games floor never appears on the board, so
// without this "view other players' stats" would only ever mean "view the top
// of a value board".
export function fetchProspectDirectory(
  params: FetchProspectLeaderboardParams = {}
): Promise<PagedResult<ProspectDirectoryEntry>> {
  return fetchJson<PagedResult<ProspectDirectoryEntry>>(
    `/v1/become-pro/prospects${toQueryString(params)}`
  );
}

export function fetchProspect(username: string, seasonId?: string): Promise<ProspectProfile> {
  return fetchJson<ProspectProfile>(
    `/v1/become-pro/prospects/${encodeURIComponent(username)}${toQueryString({ seasonId })}`
  );
}

// ── The signed-in user's own prospect data ────────────────────────────────

// Backs the header rank badge, which mounts on every page — deliberately
// join-free on the API side so the header never pulls a paged list.
export function fetchMyProspectRank(): Promise<ProspectRankSummary> {
  return fetchJson<ProspectRankSummary>("/v1/me/become-pro");
}

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

export function createProspectGame(
  seasonId: string,
  body: ProspectGameInput
): Promise<ProspectGame> {
  return sendJson<ProspectGame>(`/v1/me/become-pro/seasons/${seasonId}/games`, "POST", body);
}

// Editing a row clears its verification server-side: evidence checked against
// the old numbers does not vouch for the new ones. See the API contract.
export function updateProspectGame(
  gameId: string,
  body: Partial<ProspectGameInput>
): Promise<ProspectGame> {
  return sendJson<ProspectGame>(`/v1/me/become-pro/games/${gameId}`, "PATCH", body);
}

export function deleteProspectGame(gameId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/me/become-pro/games/${gameId}`, "DELETE");
}

export interface UploadEvidenceParams {
  seasonId: string;
  file: File;
  // Which games this document covers. Omitted with wholeSeason, which is the
  // common case: a league's published stat page covers everything at once.
  gameIds?: string[];
  wholeSeason?: boolean;
}

export function uploadProspectEvidence({
  seasonId,
  file,
  gameIds,
  wholeSeason,
}: UploadEvidenceParams): Promise<ProspectEvidence> {
  const formData = new FormData();
  formData.append("file", file);
  if (gameIds?.length) formData.append("gameIds", gameIds.join(","));
  if (wholeSeason) formData.append("wholeSeason", "true");
  return postFormData<ProspectEvidence>(
    `/v1/me/become-pro/seasons/${seasonId}/evidence`,
    formData
  );
}

export function deleteProspectEvidence(evidenceId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/me/become-pro/evidence/${evidenceId}`, "DELETE");
}

// ── Admin review ──────────────────────────────────────────────────────────
// Without a reviewer nothing ever reaches VERIFIED, every prospect sits at a
// reliability of zero forever, and the upload is a queue nobody can empty.

export interface FetchEvidenceQueueParams {
  status?: EvidenceStatus;
  page?: number;
  pageSize?: number;
}

export function fetchProspectEvidenceQueue(
  params: FetchEvidenceQueueParams = {}
): Promise<PagedResult<AdminProspectEvidence>> {
  return fetchJson<PagedResult<AdminProspectEvidence>>(
    `/v1/admin/become-pro/evidence${toQueryString(params)}`
  );
}

export function reviewProspectEvidence(
  evidenceId: string,
  body: { status: Extract<EvidenceStatus, "VERIFIED" | "REJECTED">; note?: string }
): Promise<ProspectEvidence> {
  return sendJson<ProspectEvidence>(
    `/v1/admin/become-pro/evidence/${evidenceId}`,
    "PATCH",
    body
  );
}
