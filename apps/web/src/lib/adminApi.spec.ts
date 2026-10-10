import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  correctGameEvent,
  deleteAdminUser,
  fetchAdminCorrections,
  fetchAdminGames,
  fetchAdminPlayers,
  fetchAdminTeams,
  fetchAdminUsers,
  previewEventCorrection,
  replayAdminGame,
  revertEventCorrection,
  updateAdminPlayer,
  updateAdminTeam,
  updateAdminUserRole,
} from "./adminApi";

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

describe("adminApi", () => {
  beforeEach(() => {
    mockFetchOnce({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchAdminTeams hits /v1/admin/teams with no query string when no params are given", async () => {
    await fetchAdminTeams();
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/teams", { credentials: "include" });
  });

  it("fetchAdminTeams serialises search/page/pageSize into the query string", async () => {
    await fetchAdminTeams({ search: "lakers", page: 2, pageSize: 10 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const search = new URL(String(url), "http://localhost").searchParams;
    expect(search.get("search")).toBe("lakers");
    expect(search.get("page")).toBe("2");
    expect(search.get("pageSize")).toBe("10");
  });

  it("updateAdminTeam sends a PATCH with the given patch", async () => {
    await updateAdminTeam("team-1", { city: "LA" });
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/teams/team-1", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: "LA" }),
    });
  });

  it("fetchAdminPlayers serialises teamId alongside search/page/pageSize", async () => {
    await fetchAdminPlayers({ teamId: "team-1", search: "lebron" });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const search = new URL(String(url), "http://localhost").searchParams;
    expect(search.get("teamId")).toBe("team-1");
    expect(search.get("search")).toBe("lebron");
  });

  it("updateAdminPlayer sends a PATCH with the given patch", async () => {
    await updateAdminPlayer("player-1", { jerseyNumber: "6" });
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/players/player-1", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jerseyNumber: "6" }),
    });
  });

  it("fetchAdminUsers hits /v1/admin/users", async () => {
    await fetchAdminUsers({ search: "leb" });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const search = new URL(String(url), "http://localhost").searchParams;
    expect(search.get("search")).toBe("leb");
  });

  it("deleteAdminUser sends a DELETE", async () => {
    await deleteAdminUser("user-2");
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/users/user-2", {
      method: "DELETE",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("updateAdminUserRole sends a PATCH with { role }", async () => {
    await updateAdminUserRole("user-2", "ADMIN");
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/users/user-2/role", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });
  });

  it("fetchAdminGames serialises the season, team and date window", async () => {
    await fetchAdminGames({ season: "2025-26", teamId: "team-1", fromDate: "2026-04-01", toDate: "2026-04-10" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/admin/games?season=2025-26&teamId=team-1&fromDate=2026-04-01&toDate=2026-04-10",
      { credentials: "include" },
    );
  });

  it("fetchAdminCorrections can filter to one game", async () => {
    await fetchAdminCorrections({ gameId: "game-1", page: 2 });
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/events/corrections?gameId=game-1&page=2", { credentials: "include" });
  });

  it("previewEventCorrection and correctGameEvent POST the same body to their own routes", async () => {
    const body = { playerId: "player-2", creditPlayerId: null, reason: "wrong shooter" };
    await previewEventCorrection("game-1", 7, body);
    await correctGameEvent("game-1", 7, body);
    const request = { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/games/game-1/events/7/preview", request);
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/games/game-1/events/7/correct", request);
  });

  it("revertEventCorrection POSTs the reason", async () => {
    await revertEventCorrection("correction-1", "wrong call");
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/corrections/correction-1/revert", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wrong call" }),
    });
  });

  it("replayAdminGame POSTs with no body", async () => {
    await replayAdminGame("game-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/admin/games/game-1/replay", {
      method: "POST",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });
});
