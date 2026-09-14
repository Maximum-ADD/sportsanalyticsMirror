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
