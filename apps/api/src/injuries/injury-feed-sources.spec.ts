import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EspnInjuryFeedSource, FixtureInjuryFeedSource } from "./injury-feed-sources.js";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";

describe("EspnInjuryFeedSource", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads and parses ESPN's report", async () => {
    fetchMock.mockResolvedValue(new Response('{"injuries":[]}', { status: 200 }));

    await expect(new EspnInjuryFeedSource().readReport()).resolves.toEqual({ injuries: [] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("site.api.espn.com");
  });

  it("calls the feed unavailable on an error status, a network failure or a non-JSON body", async () => {
    const source = new EspnInjuryFeedSource();

    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(source.readReport()).rejects.toBeInstanceOf(InjuryFeedUnavailableError);

    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    await expect(source.readReport()).rejects.toBeInstanceOf(InjuryFeedUnavailableError);

    fetchMock.mockResolvedValue(new Response("<html>maintenance</html>", { status: 200 }));
    await expect(source.readReport()).rejects.toBeInstanceOf(InjuryFeedUnavailableError);
  });
});

describe("FixtureInjuryFeedSource", () => {
  it("calls the feed unavailable when the fixture file is missing", async () => {
    await expect(new FixtureInjuryFeedSource("no/such/file.json").readReport()).rejects.toBeInstanceOf(
      InjuryFeedUnavailableError
    );
  });
});
