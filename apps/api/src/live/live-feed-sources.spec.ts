import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CdnLiveFeedSource, FixtureLiveFeedSource } from "./live-feed-sources.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";

const BOX_SCORE_PATH = "/static/json/liveData/boxscore/boxscore_0012600028.json";

function buildResponse(status: number, body: string, contentType: string): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

describe("CdnLiveFeedSource", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const source = new CdnLiveFeedSource();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the file from the CDN with the Referer it insists on, and parses it", async () => {
    fetchMock.mockResolvedValue(buildResponse(200, '{"game":{"gameId":"0012600028"}}', "application/json"));

    await expect(source.readJson(BOX_SCORE_PATH)).resolves.toEqual({ game: { gameId: "0012600028" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://cdn.nba.com${BOX_SCORE_PATH}`);
    expect(init?.headers).toEqual({ Referer: "https://www.nba.com/" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  // What the CDN really sends for a game that hasn't started: its S3 origin's
  // "AccessDenied" XML. A 404 from the same origin means the same.
  it.each([403, 404])("reads a %d with an XML body as a file that isn't published yet", async (status) => {
    fetchMock.mockResolvedValue(buildResponse(status, "<Error><Code>AccessDenied</Code></Error>", "application/xml"));

    await expect(source.readJson(BOX_SCORE_PATH)).resolves.toBeNull();
  });

  // What the CDN sends when it refuses the request itself (no Referer, or a
  // blocked address). Taking it for "not published" would show an empty list
  // during an outage.
  it("reports a 403 with an HTML page as the CDN refusing the request", async () => {
    fetchMock.mockResolvedValue(buildResponse(403, "<HTML><TITLE>Access Denied</TITLE></HTML>", "text/html"));

    await expect(source.readJson(BOX_SCORE_PATH)).rejects.toThrow(/refused .* status 403 \(text\/html\)/);
  });

  it("reports any other failed status as unavailable", async () => {
    fetchMock.mockResolvedValue(buildResponse(503, "busy", "text/plain"));

    await expect(source.readJson(BOX_SCORE_PATH)).rejects.toThrow(LiveFeedUnavailableError);
  });

  it("reports a network failure or timeout as unavailable", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    await expect(source.readJson(BOX_SCORE_PATH)).rejects.toThrow(/Could not reach the NBA CDN/);
  });

  it("reports a body that isn't JSON as unavailable", async () => {
    fetchMock.mockResolvedValue(buildResponse(200, "<html>maintenance</html>", "text/html"));

    await expect(source.readJson(BOX_SCORE_PATH)).rejects.toThrow(/not valid JSON/);
  });
});

describe("FixtureLiveFeedSource", () => {
  let fixturesDirectory: string;

  beforeEach(async () => {
    fixturesDirectory = await mkdtemp(join(tmpdir(), "live-fixtures-"));
  });

  afterEach(async () => {
    await rm(fixturesDirectory, { recursive: true, force: true });
  });

  it("reads a feed file saved under its CDN file name", async () => {
    await writeFile(join(fixturesDirectory, "boxscore_0012600028.json"), '{"game":{"gameStatus":3}}');

    await expect(new FixtureLiveFeedSource(fixturesDirectory).readJson(BOX_SCORE_PATH)).resolves.toEqual({
      game: { gameStatus: 3 },
    });
  });

  it("treats a missing file as a game that hasn't started", async () => {
    await expect(new FixtureLiveFeedSource(fixturesDirectory).readJson(BOX_SCORE_PATH)).resolves.toBeNull();
  });

  it("reports a file that isn't JSON as unavailable", async () => {
    await writeFile(join(fixturesDirectory, "boxscore_0012600028.json"), "not json");

    await expect(new FixtureLiveFeedSource(fixturesDirectory).readJson(BOX_SCORE_PATH)).rejects.toThrow(LiveFeedUnavailableError);
  });
});
