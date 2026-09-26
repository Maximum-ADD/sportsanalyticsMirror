import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  MY_BECOME_PRO_QUERY_KEY,
  MY_BECOME_PRO_SUMMARY_QUERY_KEY,
  createProspectGame,
  createProspectSeason,
  deleteProspectGame,
  deleteProspectSeason,
  fetchMyBecomePro,
  fetchMyBecomeProSummary,
  invalidateBecomeProQueries,
  updateProspectGame,
  updateProspectSeason,
} from "./becomeProApi";
import { makeProspectGameInput } from "@/test/becomeProFixtures";

// Stubs fetch itself rather than the apiClient wrapper, so these assertions
// pin the exact URL, method, headers and serialised body the backend
// receives — a contract the API has to honour, not a test of our own
// indirection.
function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
  );
}

const JSON_HEADERS = { "Content-Type": "application/json" };

describe("becomeProApi", () => {
  beforeEach(() => {
    mockFetchOnce({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("reads", () => {
    // Become Pro is private: every read is the signed-in user's own, under /me.
    it("fetches the whole page from the user's own endpoint", async () => {
      await fetchMyBecomePro();
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro", { credentials: "include" });
    });

    it("selects a specific season when asked", async () => {
      await fetchMyBecomePro("season-2");
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro?seasonId=season-2", { credentials: "include" });
    });

    it("fetches the lean summary for the cards", async () => {
      await fetchMyBecomeProSummary();
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/summary", { credentials: "include" });
    });
  });

  describe("seasons", () => {
    it("creates a season", async () => {
      const body = { season: "2025-26", competitionLevel: "NCAA_D2" as const, position: "G", teamName: "Riverside" };
      await createProspectSeason(body);

      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
    });

    it("patches a season", async () => {
      await updateProspectSeason("season-1", { competitionLevel: "NCAA_D1" });
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons/season-1", {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ competitionLevel: "NCAA_D1" }),
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
  });

  describe("games", () => {
    it("posts a game under its season", async () => {
      const game = makeProspectGameInput();
      await createProspectGame("season-1", game);

      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/seasons/season-1/games", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(game),
      });
    });

    // Games are patched by their own id — correcting one must not require
    // knowing which season it belongs to.
    it("patches a game by its own id", async () => {
      await updateProspectGame("game-1", { points: 30 });
      expect(fetch).toHaveBeenCalledWith("/api/v1/me/become-pro/games/game-1", {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
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

  describe("invalidateBecomeProQueries", () => {
    it("refreshes the page and both cards after a write", async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(MY_BECOME_PRO_QUERY_KEY, {});
      queryClient.setQueryData(MY_BECOME_PRO_SUMMARY_QUERY_KEY, {});

      await invalidateBecomeProQueries(queryClient);

      expect(queryClient.getQueryState(MY_BECOME_PRO_QUERY_KEY)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(MY_BECOME_PRO_SUMMARY_QUERY_KEY)?.isInvalidated).toBe(true);
    });
  });
});
