import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";

// Where the live feed's raw JSON comes from: the NBA's CDN in normal running,
// or a folder of saved files while developing (see LIVE_FEED_FIXTURES_DIR in
// live-games.module.ts). Everything downstream sees the same interface, so
// the fixtures exercise exactly the parsing and caching production uses.

export const LIVE_FEED_SOURCE = Symbol("LIVE_FEED_SOURCE");

export interface LiveFeedSource {
  /**
   * Reads one feed file.
   *
   * @param path - the file's path on the CDN, e.g. "/static/json/liveData/boxscore/boxscore_0012600028.json".
   * @returns the parsed JSON, or null when the file isn't published (a game that hasn't started).
   * @throws LiveFeedUnavailableError when the file can't be read for any other reason.
   */
  readJson(path: string): Promise<unknown | null>;
}

const NBA_CDN_ORIGIN = "https://cdn.nba.com";
// The CDN (Akamai) answers 403 to /static/json requests that don't name
// nba.com as their Referer. Checked on 2026-10-06: every other browser
// header (User-Agent, Origin, Sec-Fetch-*) turned out to be optional.
const NBA_REFERER = "https://www.nba.com/";
// The season schedule is ~5 MB uncompressed (~260 KB gzipped). Per-game files
// arrive in well under a second, so this only cuts off a hung connection.
const REQUEST_TIMEOUT_IN_MILLISECONDS = 10_000;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;

/** Reads feed files from the NBA's public CDN. */
export class CdnLiveFeedSource implements LiveFeedSource {
  async readJson(path: string): Promise<unknown | null> {
    const response = await requestFeedFile(path);
    if (response.ok) return readResponseJson(response, path);

    await discardBody(response);
    if (isUnpublishedFileResponse(response)) return null;
    throw new LiveFeedUnavailableError(describeRefusal(response, path));
  }
}

/** Reads feed files saved under one folder, by their CDN file name. */
export class FixtureLiveFeedSource implements LiveFeedSource {
  constructor(private readonly fixturesDirectory: string) {}

  async readJson(path: string): Promise<unknown | null> {
    const fixturePath = join(this.fixturesDirectory, basename(path));
    let fixtureText: string;
    try {
      fixtureText = await readFile(fixturePath, "utf8");
    } catch {
      // A missing file plays the part of a game that hasn't started.
      return null;
    }
    return parseJsonText(fixtureText, fixturePath);
  }
}

async function requestFeedFile(path: string): Promise<Response> {
  try {
    return await fetch(`${NBA_CDN_ORIGIN}${path}`, {
      headers: { Referer: NBA_REFERER },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
    });
  } catch (error) {
    throw new LiveFeedUnavailableError(`Could not reach the NBA CDN for ${path}`, { cause: error });
  }
}

async function readResponseJson(response: Response, path: string): Promise<unknown> {
  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    throw new LiveFeedUnavailableError(`The NBA CDN dropped the connection while sending ${path}`, { cause: error });
  }
  return parseJsonText(responseText, path);
}

function parseJsonText(jsonText: string, source: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new LiveFeedUnavailableError(`${source} is not valid JSON`, { cause: error });
  }
}

// A file that isn't published yet comes back from the CDN's storage origin
// (S3) as 403 or 404 with an XML error body. The CDN refusing the request
// itself (missing Referer, or a blocked IP) is a 403 with an HTML page, and
// must not pass for "this game hasn't started": that would show an empty
// list instead of an outage.
function isUnpublishedFileResponse(response: Response): boolean {
  const isMissingStatus = response.status === HTTP_STATUS_FORBIDDEN || response.status === HTTP_STATUS_NOT_FOUND;
  const contentType = response.headers.get("content-type") ?? "";
  return isMissingStatus && contentType.includes("xml");
}

function describeRefusal(response: Response, path: string): string {
  const contentType = response.headers.get("content-type") ?? "unknown content type";
  return `The NBA CDN refused ${path} with status ${response.status} (${contentType})`;
}

// Reads an unwanted body to the end so the connection can be reused. Node's
// fetch holds the socket until a response body is consumed or collected.
async function discardBody(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined);
}
