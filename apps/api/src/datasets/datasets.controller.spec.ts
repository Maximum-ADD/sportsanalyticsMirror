import { describe, expect, it, vi } from "vitest";
import { DatasetReleasesController, parsePublishBody } from "./datasets.controller.js";

// The controller's session guard imports auth.config, which builds a real
// PrismaClient at import time. Its native engine loads in the background,
// and if this short file ends first, Vitest tears down the worker mid-load
// and the engine aborts the whole run. Nothing here needs real auth.
vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

describe("parsePublishBody", () => {
  it("throws when body is not an object", () => {
    expect(() => parsePublishBody(null)).toThrow("must be an object");
    expect(() => parsePublishBody("str")).toThrow("must be an object");
    expect(() => parsePublishBody(42)).toThrow("must be an object");
  });

  it("throws when version is missing or empty", () => {
    expect(() => parsePublishBody({ description: "d", season: "s" })).toThrow("version is required");
    expect(() => parsePublishBody({ version: "", description: "d", season: "s" })).toThrow("version is required");
    expect(() => parsePublishBody({ version: "   ", description: "d", season: "s" })).toThrow("version is required");
    expect(() => parsePublishBody({ version: 42, description: "d", season: "s" })).toThrow("version is required");
  });

  it("throws when description is missing or empty", () => {
    expect(() => parsePublishBody({ version: "v", season: "s" })).toThrow("description is required");
    expect(() => parsePublishBody({ version: "v", description: "", season: "s" })).toThrow("description is required");
    expect(() => parsePublishBody({ version: "v", description: 42, season: "s" })).toThrow("description is required");
  });

  it("throws when season is missing or empty", () => {
    expect(() => parsePublishBody({ version: "v", description: "d" })).toThrow("season is required");
    expect(() => parsePublishBody({ version: "v", description: "d", season: "" })).toThrow("season is required");
    expect(() => parsePublishBody({ version: "v", description: "d", season: 42 })).toThrow("season is required");
  });

  it("returns trimmed fields when all are valid", () => {
    const result = parsePublishBody({ version: "  1.0  ", description: "  Initial  ", season: "  2025-26  " });
    expect(result).toEqual({ version: "1.0", description: "Initial", season: "2025-26" });
  });
});

describe("DatasetReleasesController.downloadRelease", () => {
  function makeResponse() {
    const res = { status: vi.fn(), set: vi.fn(), send: vi.fn() };
    res.status.mockReturnValue(res);
    res.set.mockReturnValue(res);
    return res;
  }

  function download(result: unknown) {
    const service = { downloadRelease: vi.fn().mockResolvedValue(result) };
    const res = makeResponse();
    const done = new DatasetReleasesController(service as never).downloadRelease("2025-26.1", res as never);
    return { done, res };
  }

  it("names the stored snapshot after its version", async () => {
    const { done, res } = download({ kind: "ready", csv: "a\r\n", checksum: "sum", source: "stored" });
    await done;

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "Content-Disposition": 'attachment; filename="dataset-2025-26.1.csv"',
        "X-Checksum-SHA256": "sum",
        "X-Dataset-Source": "stored",
      }),
    );
    expect(res.send).toHaveBeenCalledWith("a\r\n");
  });

  // F26: a rebuild still downloads, but under a name that can't be taken
  // for the snapshot published as 2025-26.1 once it's saved.
  it("names a rebuilt file as a rebuild", async () => {
    const { done, res } = download({ kind: "ready", csv: "a\r\n", checksum: "sum", source: "rebuilt" });
    await done;

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "Content-Disposition": 'attachment; filename="dataset-2025-26.1-rebuilt.csv"',
        "X-Dataset-Source": "rebuilt",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("answers 404 for an unknown version", async () => {
    const { done, res } = download({ kind: "missing" });

    await expect(done).rejects.toMatchObject({ status: 404 });
    expect(res.send).not.toHaveBeenCalled();
  });
});
