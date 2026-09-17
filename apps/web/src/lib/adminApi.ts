import { fetchJson, sendJson } from "./apiClient";
import { toQueryString } from "./nbaApi";
import type { AdminUserSummary, PagedResult, Player, Team, UserRole } from "@/types/nba";

export interface FetchAdminTeamsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function fetchAdminTeams(params: FetchAdminTeamsParams = {}): Promise<PagedResult<Team>> {
  return fetchJson<PagedResult<Team>>(`/v1/admin/teams${toQueryString(params)}`);
}

// Every field is optional — only send what's actually being changed.
// nbaTeamId/id stay off this type entirely: they're the identity ingestion
// upserts against, and the API rejects editing them.
export interface UpdateTeamParams {
  name?: string;
  abbreviation?: string;
  city?: string;
  conference?: string;
  division?: string;
  logoUrl?: string | null;
}

export function updateAdminTeam(teamId: string, patch: UpdateTeamParams): Promise<Team> {
  return sendJson<Team>(`/v1/admin/teams/${teamId}`, "PATCH", patch);
}

export interface FetchAdminPlayersParams {
  search?: string;
  teamId?: string;
  page?: number;
  pageSize?: number;
}

export function fetchAdminPlayers(params: FetchAdminPlayersParams = {}): Promise<PagedResult<Player>> {
  return fetchJson<PagedResult<Player>>(`/v1/admin/players${toQueryString(params)}`);
}

// Same "every field optional, id/nbaPlayerId excluded" contract as
// UpdateTeamParams. birthDate is an ISO date string (or null to clear it) —
// the API parses it into a real Date.
export interface UpdatePlayerParams {
  firstName?: string;
  lastName?: string;
  position?: string;
  heightInches?: number | null;
  weightLbs?: number | null;
  jerseyNumber?: string | null;
  headshotUrl?: string | null;
  teamId?: string | null;
  birthDate?: string | null;
  school?: string | null;
  country?: string | null;
  lastAffiliation?: string | null;
  seasonExp?: number | null;
  rosterStatus?: string | null;
  draftYear?: number | null;
  draftRound?: number | null;
  draftNumber?: number | null;
}

export function updateAdminPlayer(playerId: string, patch: UpdatePlayerParams): Promise<Player> {
  return sendJson<Player>(`/v1/admin/players/${playerId}`, "PATCH", patch);
}

export interface FetchAdminUsersParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function fetchAdminUsers(params: FetchAdminUsersParams = {}): Promise<PagedResult<AdminUserSummary>> {
  return fetchJson<PagedResult<AdminUserSummary>>(`/v1/admin/users${toQueryString(params)}`);
}

export function deleteAdminUser(userId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/admin/users/${userId}`, "DELETE");
}

export function updateAdminUserRole(userId: string, role: UserRole): Promise<AdminUserSummary> {
  return sendJson<AdminUserSummary>(`/v1/admin/users/${userId}/role`, "PATCH", { role });
}

// --- Submission Review ---

export interface IngestionBatchSummary {
  id: string;
  gameId: string;
  source: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  eventsAccepted: number;
  eventsRejected: number;
  rejectionSummary: unknown;
  reviewedAt: string | null;
  reviewNotes: string | null;
  game: {
    id: string;
    gameDate: string;
    season: string;
    nbaGameId: string;
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
  reviewedBy: { id: string; name: string } | null;
}

/** Orders the batch list by the date the game was played (the Date column),
 * by season, or by when the pull that produced the batch ran. */
export type BatchSortField = "date" | "season" | "ingested";
export type SortDirection = "asc" | "desc";

export interface FetchAdminBatchesParams {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: BatchSortField;
  order?: SortDirection;
}

export function fetchAdminBatches(params: FetchAdminBatchesParams = {}): Promise<PagedResult<IngestionBatchSummary>> {
  return fetchJson<PagedResult<IngestionBatchSummary>>(`/v1/admin/batches${toQueryString(params)}`);
}

export function approveAdminBatch(batchId: string, reviewNotes?: string): Promise<IngestionBatchSummary> {
  return sendJson<IngestionBatchSummary>(`/v1/admin/batches/${batchId}/approve`, "POST", { reviewNotes });
}

export function rejectAdminBatch(batchId: string, reviewNotes?: string): Promise<IngestionBatchSummary> {
  return sendJson<IngestionBatchSummary>(`/v1/admin/batches/${batchId}/reject`, "POST", { reviewNotes });
}

// --- Event Corrections ---

export interface EventCorrection {
  id: string;
  gameId: string;
  sequence: number;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  correctedById: string | null;
  reason: string | null;
  correctedAt: string;
  game: { id: string; gameDate: string; season: string; nbaGameId: string };
  correctedBy: { id: string; name: string } | null;
}

export interface FetchAdminCorrectionsParams {
  page?: number;
  pageSize?: number;
}

export function fetchAdminCorrections(params: FetchAdminCorrectionsParams = {}): Promise<PagedResult<EventCorrection>> {
  return fetchJson<PagedResult<EventCorrection>>(`/v1/admin/events/corrections${toQueryString(params)}`);
}

// --- API Consumers ---

export interface ApiConsumer {
  id: string;
  name: string;
  contactEmail: string | null;
  rateLimit: number;
  dailyQuota: number;
  isActive: boolean;
  createdAt: string;
  // USER — a consumer auto-provisioned for a signed-in user's own API
  // access (user is the owner); EXTERNAL — an admin-created third-party
  // consumer. This is how the admin list tells user keys apart from
  // external integration keys.
  kind: "USER" | "EXTERNAL";
  user: { id: string; name: string; email: string } | null;
  keys: { id: string; label: string | null; isActive: boolean; lastUsedAt: string | null; createdAt: string }[];
  _count: { usageLog: number };
}

export interface CreatedApiKey {
  id: string;
  label: string | null;
  rawKey: string;
  createdAt: string;
}

export function fetchAdminConsumers(params: { page?: number; pageSize?: number } = {}): Promise<PagedResult<ApiConsumer>> {
  return fetchJson<PagedResult<ApiConsumer>>(`/v1/admin/consumers${toQueryString(params)}`);
}

export function createAdminConsumer(data: { name: string; contactEmail?: string; rateLimit?: number; dailyQuota?: number }): Promise<ApiConsumer> {
  return sendJson<ApiConsumer>("/v1/admin/consumers", "POST", data);
}

export function updateAdminConsumer(consumerId: string, patch: Record<string, unknown>): Promise<ApiConsumer> {
  return sendJson<ApiConsumer>(`/v1/admin/consumers/${consumerId}`, "PATCH", patch);
}

export function createAdminApiKey(consumerId: string, label?: string): Promise<CreatedApiKey> {
  return sendJson<CreatedApiKey>(`/v1/admin/consumers/${consumerId}/keys`, "POST", { label });
}

export function revokeAdminApiKey(consumerId: string, keyId: string): Promise<{ revoked: true }> {
  return sendJson<{ revoked: true }>(`/v1/admin/consumers/${consumerId}/keys/${keyId}`, "DELETE");
}

export function deleteAdminConsumer(consumerId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/admin/consumers/${consumerId}`, "DELETE");
}

export function deleteAdminApiKey(consumerId: string, keyId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/admin/consumers/${consumerId}/keys/${keyId}/purge`, "DELETE");
}

// --- Ingestion Schedule & Manual Pull ---

export type IngestionFrequency = "NEVER" | "HOURLY" | "DAILY" | "WEEKLY";

export interface IngestionScheduleConfig {
  frequency: IngestionFrequency;
  lastRunAt: string | null;
  updatedAt: string;
  /** False where the Python ingestion environment is absent (e.g. Render) —
   * scheduled pulls can't run there, only on machines that have it. */
  ingestionAvailable: boolean;
}

export interface TriggerResult {
  started: boolean;
  message: string;
}

export function fetchIngestionSchedule(): Promise<IngestionScheduleConfig> {
  return fetchJson<IngestionScheduleConfig>("/v1/admin/ingestion/schedule");
}

export function updateIngestionSchedule(frequency: IngestionFrequency): Promise<IngestionScheduleConfig> {
  return sendJson<IngestionScheduleConfig>("/v1/admin/ingestion/schedule", "PUT", { frequency });
}

/** Narrows what a manual pull covers. Every field is optional; an empty
 * object pulls the current season's recent games plus the postseason, which
 * is what the button did before the window existed. */
export interface PullOptions {
  season?: string;
  fromDate?: string;
  toDate?: string;
}

export function triggerIngestionPull(options: PullOptions = {}): Promise<TriggerResult> {
  return sendJson<TriggerResult>("/v1/admin/ingestion/pull", "POST", options);
}

export function deleteIngestionBatch(batchId: string): Promise<{ success: boolean }> {
  return sendJson<{ success: boolean }>(`/v1/admin/ingestion/batches/${batchId}`, "DELETE");
}
