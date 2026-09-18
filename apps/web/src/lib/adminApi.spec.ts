import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAdminUser,
  fetchAdminPlayers,
  fetchAdminTeams,
  fetchAdminUsers,
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
});
