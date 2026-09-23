import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMe,
  fetchSuggestedPlayers,
  followPlayer,
  unfollowPlayer,
  updateMe,
  uploadAvatar,
} from "./meApi";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  );
}

describe("meApi", () => {
  beforeEach(() => {
    mockFetchOnce({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchMe requests /v1/me", async () => {
    await fetchMe();
    expect(fetch).toHaveBeenCalledWith("/api/v1/me", { credentials: "include" });
  });

  it("updateMe sends a PATCH with the given fields", async () => {
    await updateMe({ username: "lebron", favoriteTeamId: "team-1" });
    expect(fetch).toHaveBeenCalledWith("/api/v1/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "lebron", favoriteTeamId: "team-1" }),
    });
  });

  it("uploadAvatar posts the file as multipart form data", async () => {
    const file = new File(["avatar-bytes"], "avatar.png", { type: "image/png" });
    await uploadAvatar(file);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const body = init?.body;
    expect(url).toBe("/api/v1/me/avatar");
    expect(init?.method).toBe("POST");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBe(file);
  });

  it("followPlayer sends a PUT to the followed-players endpoint", async () => {
    await followPlayer("player-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/me/followed-players/player-1", {
      method: "PUT",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("unfollowPlayer sends a DELETE to the followed-players endpoint", async () => {
    await unfollowPlayer("player-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/me/followed-players/player-1", {
      method: "DELETE",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("fetchSuggestedPlayers omits the count query string when none is given", async () => {
    await fetchSuggestedPlayers("team-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/teams/team-1/suggested-players", { credentials: "include" });
  });

  it("fetchSuggestedPlayers includes count in the query string when given", async () => {
    await fetchSuggestedPlayers("team-1", 5);
    expect(fetch).toHaveBeenCalledWith("/api/v1/teams/team-1/suggested-players?count=5", { credentials: "include" });
  });
});
