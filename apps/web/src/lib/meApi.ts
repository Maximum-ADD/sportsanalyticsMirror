import { fetchJson, postFormData, sendJson } from "./apiClient";
import type { MeProfile, SavedLineup, SuggestedPlayer } from "@/types/nba";

export function fetchMe(): Promise<MeProfile> {
  return fetchJson<MeProfile>("/v1/me");
}

export interface UpdateMeParams {
  username?: string;
  favoriteTeamId?: string | null;
}

export function updateMe(params: UpdateMeParams): Promise<MeProfile> {
  return sendJson<MeProfile>("/v1/me", "PATCH", params);
}

// multipart upload — file comes straight from an <input type="file">'s
// FileList, not re-encoded as JSON/base64.
export function uploadAvatar(file: File): Promise<{ avatarUrl: string | null }> {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData<{ avatarUrl: string | null }>("/v1/me/avatar", formData);
}

export function followPlayer(playerId: string): Promise<{ following: true }> {
  return sendJson<{ following: true }>(`/v1/me/followed-players/${playerId}`, "PUT");
}

export function unfollowPlayer(playerId: string): Promise<{ following: false }> {
  return sendJson<{ following: false }>(`/v1/me/followed-players/${playerId}`, "DELETE");
}

export function fetchSavedLineups(): Promise<SavedLineup[]> {
  return fetchJson<SavedLineup[]>("/v1/me/lineups");
}

// Values are sent verbatim from the board — the API freezes them per slot
// and re-validates the board against the solver's constraints before saving.
export interface SaveLineupParams {
  budget: number;
  // Required: every saved lineup gets a name so a profile full of saves
  // stays findable. The API rejects a missing or blank one.
  name: string;
  slots: { playerId: string; predictedPointsAtSave: number; salaryAtSave: number }[];
}

export function saveLineup(params: SaveLineupParams): Promise<SavedLineup> {
  return sendJson<SavedLineup>("/v1/me/lineups", "POST", params);
}

export function deleteSavedLineup(lineupId: string): Promise<{ deleted: true }> {
  return sendJson<{ deleted: true }>(`/v1/me/lineups/${lineupId}`, "DELETE");
}

export function fetchSuggestedPlayers(teamId: string, count?: number): Promise<{ players: SuggestedPlayer[] }> {
  const query = count !== undefined ? `?count=${count}` : "";
  return fetchJson<{ players: SuggestedPlayer[] }>(`/v1/teams/${teamId}/suggested-players${query}`);
}
