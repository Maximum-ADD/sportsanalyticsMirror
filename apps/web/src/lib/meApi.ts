import { fetchJson, postFormData, sendJson } from "./apiClient";
import type { MeProfile, SuggestedPlayer } from "@/types/nba";

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

export function fetchSuggestedPlayers(teamId: string, count?: number): Promise<{ players: SuggestedPlayer[] }> {
  const query = count !== undefined ? `?count=${count}` : "";
  return fetchJson<{ players: SuggestedPlayer[] }>(`/v1/teams/${teamId}/suggested-players${query}`);
}
