import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadDatasetRelease } from "./datasetsApi";
import { ApiError } from "./apiClient";

const OBJECT_URL = "blob:mock-object-url";

function mockDownloadResponse(csv: string, checksum: string, source = "stored"): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "X-Checksum-SHA256": checksum, "X-Dataset-Source": source }),
    blob: async () => new Blob([csv], { type: "text/csv" }),
  } as unknown as Response;
}

/** The file name the browser was told to save the download as. */
function savedFileName(): string {
  return (vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0] as HTMLAnchorElement).download;
}

function mockErrorResponse(status: number, code: string, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message } }),
  } as unknown as Response;
}

describe("downloadDatasetRelease", () => {
  beforeEach(() => {
    // jsdom implements neither object URLs nor navigation, so both are
    // stubbed: the assertions are about what the helper hands the browser,
    // not about the browser's own save behaviour.
    vi.stubGlobal("fetch", vi.fn());
    URL.createObjectURL = vi.fn().mockReturnValue(OBJECT_URL);
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests the release through the same-origin proxy with credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(mockDownloadResponse("playerId\r\n", "abc123"));

    await downloadDatasetRelease("2025-26.1");

    expect(fetch).toHaveBeenCalledWith("/api/v1/datasets/2025-26.1/download", {
      credentials: "include",
    });
  });

  it("returns the checksum of the bytes the server actually sent, and where they came from", async () => {
    vi.mocked(fetch).mockResolvedValue(mockDownloadResponse("playerId\r\n", "abc123"));

    await expect(downloadDatasetRelease("2025-26.1")).resolves.toEqual({ checksum: "abc123", source: "stored" });
    expect(savedFileName()).toBe("dataset-2025-26.1.csv");
  });

  // F26: a rebuild is saved under a name that says so, so it can't later be
  // taken for the snapshot published under that version.
  it("saves a rebuilt file under a name that says it was rebuilt", async () => {
    vi.mocked(fetch).mockResolvedValue(mockDownloadResponse("playerId\r\n", "abc123", "rebuilt"));

    await expect(downloadDatasetRelease("2025-26.1")).resolves.toEqual({ checksum: "abc123", source: "rebuilt" });
    expect(savedFileName()).toBe("dataset-2025-26.1-rebuilt.csv");
  });

  it("reports no source when the server sends one it doesn't recognise", async () => {
    vi.mocked(fetch).mockResolvedValue(mockDownloadResponse("playerId\r\n", "abc123", "something-else"));

    await expect(downloadDatasetRelease("2025-26.1")).resolves.toMatchObject({ source: null });
    expect(savedFileName()).toBe("dataset-2025-26.1.csv");
  });

  it("hands the CSV to the browser as a file and releases the object URL", async () => {
    vi.mocked(fetch).mockResolvedValue(mockDownloadResponse("playerId\r\n", "abc123"));

    await downloadDatasetRelease("2025-26.1");

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    // Not left dangling: an un-revoked object URL pins the whole CSV in
    // memory for the lifetime of the document.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
    // The anchor is removed again rather than accumulating in the body.
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("escapes a version containing URL-significant characters", async () => {
    vi.mocked(fetch).mockResolvedValue(mockDownloadResponse("playerId\r\n", "abc123"));

    await downloadDatasetRelease("2025-26/1");

    expect(fetch).toHaveBeenCalledWith("/api/v1/datasets/2025-26%2F1/download", {
      credentials: "include",
    });
  });

  it("raises the API's own message when the download fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockErrorResponse(500, "INTERNAL_ERROR", "Something went wrong building the file"),
    );

    await expect(downloadDatasetRelease("2025-26.1")).rejects.toThrow(
      "Something went wrong building the file",
    );
    // No file is handed to the browser on a failure — the old bare-anchor
    // version would have saved the JSON error body as a .csv instead.
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("raises an ApiError carrying the status for a missing release", async () => {
    vi.mocked(fetch).mockResolvedValue(mockErrorResponse(404, "NOT_FOUND", "Release not found"));

    await expect(downloadDatasetRelease("nope")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
    });
    await expect(downloadDatasetRelease("nope")).rejects.toBeInstanceOf(ApiError);
  });
});
