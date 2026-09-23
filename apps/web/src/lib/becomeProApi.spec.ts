import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  PROSPECT_LEADERBOARD_QUERY_KEY,
  PROSPECT_RANK_QUERY_KEY,
  createProspectGame,
  createProspectSeason,
  deleteProspectEvidence,
  deleteProspectGame,
  deleteProspectSeason,
  fetchMyProspectRank,
  fetchProspect,
  fetchProspectDirectory,
  fetchProspectEvidenceQueue,
  fetchProspectLeaderboard,
  invalidateProspectQueries,
  prospectQueryKey,
  reviewProspectEvidence,
  updateProspectGame,
  updateProspectSeason,
  uploadProspectEvidence,
} from "./becomeProApi";
import { makeProspectGameInput } from "@/test/becomeProFixtures";

// Stubs fetch itself rather than the apiClient wrapper, so these assertions
// pin the exact URL, method, headers and serialised body the backend will
// receive. That is what makes this file a contract the API has to honour
// rather than a test of our own indirection.
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

describe("becomeProApi", () => {
  beforeEach(() => {
    mockFetchOnce({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("public reads", () => {
    it("fetches the leaderboard with no query string when unfiltered", async () => {
      await fetchProspectLeaderboard();
      expect(fetch).toHaveBeenCalledWith("/api/v1/become-pro/leaderboard", {
        credentials: "include",
      });
    });

    it("passes paging and filters through as query params", async () => {
      await fetchProspectLeaderboard({ page: 2, pageSize: 10, search: "kir", level: "NCAA_D1" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/become-pro/leaderboard?page=2&pageSize=10&search=kir&level=NCAA_D1",
        { credentials: "include" }
      );
    });

    // The directory is what makes "view other players' stats" mean everyone
    // rather than only the ranked top of the board.
    it("fetches the prospect directory separately from the leaderboard", async () => {
      await fetchProspectDirectory({ search: "kir" });
      expect(fetch).toHaveBeenCalledWith("/api/v1/become-pro/prospects?search=kir", {
        credentials: "include",
      });
    });

    it("fetches one prospect by username", async () => {
      await fetchProspect("kiran");
      expect(fetch).toHaveBeenCalledWith("/api/v1/become-pro/prospects/kiran", {
        credentials: "include",
      });
    });

    it("encodes a username that needs it", async () => {
      await fetchProspect("a b");
      expect(fetch).toHaveBeenCalledWith("/api/v1/become-pro/prospects/a%20b", {
        credentials: "include",
      });
    });

    it("selects a specific season when asked", async () => {
      await fetchProspect("kiran", "season-2");
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/become-pro/prospects/kiran?seasonId=season-2",
        { credentials: "include" }
      );
    });
  });

  describe("own data", () => {
    it("fetches the rank summary from its own join-free endpoint", async () => {
      await fetchMyProspectRank();
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro", { credentials: "include" });
    });

    it("creates a season", async () => {
      await createProspectSeason({
        season: "2025-26",
        competitionLevel: "NCAA_D2",
        position: "G",
        teamName: "Riverside College",
      });

      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: "2025-26",
          competitionLevel: "NCAA_D2",
          position: "G",
          teamName: "Riverside College",
        }),
      });
    });

    it("patches a season", async () => {
      await updateProspectSeason("season-1", { teamName: "Riverside" });
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons/season-1", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: "Riverside" }),
      });
    });

    it("deletes a season", async () => {
      await deleteProspectSeason("season-1");
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons/season-1", {
        method: "DELETE",
        credentials: "include",
        headers: undefined,
        body: undefined,
      });
    });

    it("posts a game under its season", async () => {
      const game = makeProspectGameInput();
      await createProspectGame("season-1", game);

      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons/season-1/games", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(game),
      });
    });

    // Games are patched by their own id, not nested under the season — editing
    // one must not require knowing which season it belongs to.
    it("patches a game by its own id", async () => {
      await updateProspectGame("game-1", { points: 30 });
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/games/game-1", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: 30 }),
      });
    });

    it("deletes a game", async () => {
      await deleteProspectGame("game-1");
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/me/become-pro/games/game-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("evidence upload", () => {
    // Deliberately does NOT set Content-Type — the browser has to set the
    // multipart boundary itself, the same reason postFormData leaves it unset.
    it("posts multipart without a Content-Type header", async () => {
      const file = new File(["x"], "sheet.pdf", { type: "application/pdf" });
      await uploadProspectEvidence({ seasonId: "season-1", file });

      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/v1/me/become-pro/seasons/season-1/evidence");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get("file")).toBe(file);
    });

    it("joins the covered game ids into one field", async () => {
      const file = new File(["x"], "sheet.pdf", { type: "application/pdf" });
      await uploadProspectEvidence({ seasonId: "season-1", file, gameIds: ["a", "b"] });

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect((init.body as FormData).get("gameIds")).toBe("a,b");
    });

    it("marks a whole-season document as such", async () => {
      const file = new File(["x"], "season.pdf", { type: "application/pdf" });
      await uploadProspectEvidence({ seasonId: "season-1", file, wholeSeason: true });

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect((init.body as FormData).get("wholeSeason")).toBe("true");
      expect((init.body as FormData).get("gameIds")).toBeNull();
    });

    it("deletes an uploaded document", async () => {
      await deleteProspectEvidence("evidence-1");
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/me/become-pro/evidence/evidence-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("admin review", () => {
    it("lists the pending queue", async () => {
      await fetchProspectEvidenceQueue({ status: "PENDING", page: 1 });
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/admin/become-pro/evidence?status=PENDING&page=1",
        { credentials: "include" }
      );
    });

    it("patches a decision with its note", async () => {
      await reviewProspectEvidence("evidence-1", { status: "REJECTED", note: "Unreadable scan" });
      expect(fetch).toHaveBeenCalledWith("/api/v1/admin/become-pro/evidence/evidence-1", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED", note: "Unreadable scan" }),
      });
    });
  });

  describe("invalidateProspectQueries", () => {
    it("refreshes the header badge and the board after a write", async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(PROSPECT_RANK_QUERY_KEY, { rank: 12 });
      queryClient.setQueryData(PROSPECT_LEADERBOARD_QUERY_KEY, { data: [] });

      await invalidateProspectQueries(queryClient);

      expect(queryClient.getQueryState(PROSPECT_RANK_QUERY_KEY)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(PROSPECT_LEADERBOARD_QUERY_KEY)?.isInvalidated).toBe(true);
    });

    it("also refreshes one prospect's own page when the username is known", async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(prospectQueryKey("kiran"), { username: "kiran" });

      await invalidateProspectQueries(queryClient, "kiran");

      expect(queryClient.getQueryState(prospectQueryKey("kiran"))?.isInvalidated).toBe(true);
    });
  });
});
