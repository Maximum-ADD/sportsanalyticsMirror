import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlayer,
  fetchPlayerComparison,
  fetchPlayers,
  fetchPlayerStats,
  fetchTeam,
  fetchTeams,
} from "./nbaApi";

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

describe("nbaApi", () => {
  beforeEach(() => {
    mockFetchOnce({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchPlayers hits /v1/players with no query string when no params are given", async () => {
    await fetchPlayers();
    expect(fetch).toHaveBeenCalledWith("/api/v1/players", { credentials: "include" });
  });

  it("fetchPlayers serialises provided params into the query string", async () => {
    await fetchPlayers({ teamId: "team-1", position: "G", search: "LeBron James", page: 2, pageSize: 10 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const search = new URL(String(url), "http://localhost").searchParams;
    expect(search.get("teamId")).toBe("team-1");
    expect(search.get("position")).toBe("G");
    expect(search.get("search")).toBe("LeBron James");
    expect(search.get("page")).toBe("2");
    expect(search.get("pageSize")).toBe("10");
  });

  it("fetchPlayers omits keys whose value is undefined", async () => {
    await fetchPlayers({ teamId: undefined, position: "C" });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).not.toContain("teamId");
    expect(String(url)).toContain("position=C");
  });

  it("fetchPlayer requests the single-player endpoint", async () => {
    await fetchPlayer("player-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/players/player-1", { credentials: "include" });
  });

  it("fetchPlayerStats requests the stats sub-resource", async () => {
    await fetchPlayerStats("player-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/players/player-1/stats", { credentials: "include" });
  });

  it("fetchPlayerComparison passes the player ids as a comma-separated list", async () => {
    await fetchPlayerComparison(["player-1", "player-2", "player-3"]);
    expect(fetch).toHaveBeenCalledWith("/api/v1/players/compare?ids=player-1,player-2,player-3", {
      credentials: "include",
    });
  });

  it("fetchTeams requests /v1/teams with a query string", async () => {
    await fetchTeams({ search: "Los Angeles", page: 1, pageSize: 12 });
    expect(fetch).toHaveBeenCalledWith("/api/v1/teams?search=Los+Angeles&page=1&pageSize=12", {
      credentials: "include",
    });
  });

  it("fetchTeam requests the single-team endpoint", async () => {
    await fetchTeam("team-1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/teams/team-1", { credentials: "include" });
  });

  it("rejects with an error when the response is not ok", async () => {
    mockFetchOnce({}, false, 404);
    await expect(fetchPlayer("missing")).rejects.toThrow("Request to /v1/players/missing failed with status 404");
  });

  it("resolves with the parsed JSON body on success", async () => {
    mockFetchOnce({ id: "player-1", firstName: "LeBron" });
    await expect(fetchPlayer("player-1")).resolves.toEqual({ id: "player-1", firstName: "LeBron" });
  });
});
