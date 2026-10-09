import { readFile } from "node:fs/promises";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";

// Where the injury report's raw JSON comes from: ESPN in normal running, or a
// saved file while developing or testing (see INJURY_FEED_FIXTURE_PATH in
// injuries.module.ts). Everything downstream sees the same interface, so the
// fixture exercises exactly the parsing and matching production uses.

export const INJURY_FEED_SOURCE = Symbol("INJURY_FEED_SOURCE");

export interface InjuryFeedSource {
  /**
   * Reads the league-wide injury report.
   *
   * @returns the parsed JSON, not yet validated.
   * @throws InjuryFeedUnavailableError when it can't be read.
   */
  readReport(): Promise<unknown>;
}

// ESPN's site API: public and keyless, but undocumented and unlicensed for
// reuse, so it can change or close without notice. Checked on 2026-10-09:
// 118 injuries across all 30 teams, every one with a return date.
const ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
// The report is ~1.3 MB and arrived in ~1.4 s when checked, so this only cuts
// off a hung connection.
const REQUEST_TIMEOUT_IN_MILLISECONDS = 15_000;

/** Reads the injury report from ESPN. */
export class EspnInjuryFeedSource implements InjuryFeedSource {
  async readReport(): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(ESPN_INJURIES_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS) });
    } catch (error) {
      throw new InjuryFeedUnavailableError("Could not reach ESPN's injury report", { cause: error });
    }

    if (!response.ok) {
      // Read the body to the end so Node's fetch can reuse the connection.
      await response.arrayBuffer().catch(() => undefined);
      throw new InjuryFeedUnavailableError(`ESPN's injury report answered with status ${response.status}`);
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      throw new InjuryFeedUnavailableError("ESPN dropped the connection while sending the injury report", { cause: error });
    }
    return parseJsonText(responseText, "ESPN's injury report");
  }
}

/** Reads the injury report from one saved file. */
export class FixtureInjuryFeedSource implements InjuryFeedSource {
  constructor(private readonly fixturePath: string) {}

  async readReport(): Promise<unknown> {
    let fixtureText: string;
    try {
      fixtureText = await readFile(this.fixturePath, "utf8");
    } catch (error) {
      throw new InjuryFeedUnavailableError(`Could not read the injury fixture at ${this.fixturePath}`, { cause: error });
    }
    return parseJsonText(fixtureText, this.fixturePath);
  }
}

function parseJsonText(jsonText: string, source: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new InjuryFeedUnavailableError(`${source} is not valid JSON`, { cause: error });
  }
}
