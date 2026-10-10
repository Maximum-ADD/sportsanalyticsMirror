import { HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { LiveGamesController } from "./live-games.controller.js";
import type { LiveGamesService } from "./live-games.service.js";

describe("LiveGamesController", () => {
  let liveGamesService: { getLiveGames: ReturnType<typeof vi.fn>; getLiveGame: ReturnType<typeof vi.fn> };
  let controller: LiveGamesController;

  beforeEach(() => {
    liveGamesService = { getLiveGames: vi.fn(), getLiveGame: vi.fn() };
    controller = new LiveGamesController(liveGamesService as unknown as LiveGamesService);
  });

  it("returns the live, upcoming and recent sections the service builds", async () => {
    const board = { live: [], upcoming: [], recent: [] };
    liveGamesService.getLiveGames.mockResolvedValue(board);

    await expect(controller.listLiveGames()).resolves.toBe(board);
  });

  it("returns one game's detail", async () => {
    const detail = { game: { gameId: "0012600028" }, homePlayers: [], awayPlayers: [], recentPlays: null };
    liveGamesService.getLiveGame.mockResolvedValue(detail);

    await expect(controller.getLiveGame("0012600028")).resolves.toBe(detail);
    expect(liveGamesService.getLiveGame).toHaveBeenCalledWith("0012600028");
  });

  it("answers 404 for a game that isn't on the live list", async () => {
    liveGamesService.getLiveGame.mockResolvedValue(null);

    const error = await controller.getLiveGame("0012600999").catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it.each([
    ["the list", (target: LiveGamesController) => target.listLiveGames()],
    ["a game", (target: LiveGamesController) => target.getLiveGame("0012600028")],
  ])("answers 503 LIVE_DATA_UNAVAILABLE when the feed is down while reading %s", async (_label, callRoute) => {
    const outage = new LiveFeedUnavailableError("The NBA CDN refused /static/json/x.json with status 403 (text/html)");
    liveGamesService.getLiveGames.mockRejectedValue(outage);
    liveGamesService.getLiveGame.mockRejectedValue(outage);

    const error = await callRoute(controller).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((error as ApiException).getResponse()).toEqual({
      error: { code: "LIVE_DATA_UNAVAILABLE", message: expect.stringContaining("status 403") },
    });
  });

  it("lets any other error through untouched", async () => {
    liveGamesService.getLiveGames.mockRejectedValue(new TypeError("boom"));

    await expect(controller.listLiveGames()).rejects.toThrow(TypeError);
  });
});
