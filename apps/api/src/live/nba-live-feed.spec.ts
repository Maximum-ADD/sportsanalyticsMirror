import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { LiveFeedSource } from "./live-feed-sources.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { NbaLiveFeed } from "./nba-live-feed.js";

function readFixture(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${fileName}`, import.meta.url), "utf8"));
}

function buildFeed(filesByPath: Record<string, unknown>): { feed: NbaLiveFeed; readJson: ReturnType<typeof vi.fn> } {
  const readJson = vi.fn(async (path: string) => filesByPath[path] ?? null);
  return { feed: new NbaLiveFeed({ readJson } satisfies LiveFeedSource), readJson };
}

describe("NbaLiveFeed", () => {
  it("reads the season schedule and today's scoreboard from their CDN paths", async () => {
    const { feed } = buildFeed({
      "/static/json/staticData/scheduleLeagueV2.json": readFixture("schedule.json"),
      "/static/json/liveData/scoreboard/todaysScoreboard_00.json": readFixture("scoreboard.json"),
    });

    await expect(feed.getSchedule()).resolves.toHaveLength(3);
    await expect(feed.getScoreboard()).resolves.toHaveLength(2);
  });

  it("reads a game's box score and play-by-play by its id", async () => {
    const { feed } = buildFeed({
      "/static/json/liveData/boxscore/boxscore_0012600028.json": readFixture("boxscore-final.json"),
      "/static/json/liveData/playbyplay/playbyplay_0012600028.json": readFixture("playbyplay-final.json"),
    });

    await expect(feed.getBoxScore("0012600028")).resolves.toMatchObject({ gameId: "0012600028", status: "final" });
    await expect(feed.getPlayByPlay("0012600028")).resolves.toMatchObject({ endedAt: "2026-10-06T04:42:50.769Z" });
  });

  it("returns null for a game whose files aren't published yet", async () => {
    const { feed } = buildFeed({});

    await expect(feed.getBoxScore("0012600025")).resolves.toBeNull();
    await expect(feed.getPlayByPlay("0012600025")).resolves.toBeNull();
  });

  it("treats a missing schedule or scoreboard as an outage, since both always exist", async () => {
    const { feed } = buildFeed({});

    await expect(feed.getSchedule()).rejects.toThrow(LiveFeedUnavailableError);
    await expect(feed.getScoreboard()).rejects.toThrow(LiveFeedUnavailableError);
  });
});
