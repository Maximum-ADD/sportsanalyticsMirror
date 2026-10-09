import { API_BASE_URL } from "./apiBase";
import { ApiError, errorMessageFrom, fetchJson, sendJson } from "./apiClient";
import { toQueryString } from "./nbaApi";
import type { PagedResult } from "@/types/nba";

export interface DatasetFieldDescriptor {
  column: string;
  type: string;
  description: string;
}

export interface DatasetRelease {
  id: string;
  version: string;
  description: string;
  season: string;
  checksum: string;
  /** Played, reviewed games the file's averages come from. Releases
   * published before it was counted that way give every game of the season
   * loaded at the time instead, unplayed scheduled games included. */
  gamesCount: number;
  /** Players in the file, one row each. 0 means the season had no played
   * games when the release was published. */
  playersCount: number;
  eventsCount: number;
  /** Set when an event correction in this season was saved after the
   * release was published, so some of its figures may be out of date. A
   * stale release still downloads; the corrected figures need a new release.
   * It can't say whether this release's own file changed — the checksum
   * check after a download does that. */
  isStale: boolean;
  fieldSchema: DatasetFieldDescriptor[];
  publishedAt: string;
  publishedBy: { id: string; name: string } | null;
}

/** Orders the release list by when it was published or by the season it
 * covers — the two differ whenever an old season is backfilled late. */
export type ReleaseSortField = "date" | "season";
export type SortDirection = "asc" | "desc";

export interface ReleaseListParams {
  page?: number;
  pageSize?: number;
  sort?: ReleaseSortField;
  order?: SortDirection;
}

export function fetchDatasetReleases(params: ReleaseListParams = {}): Promise<PagedResult<DatasetRelease>> {
  return fetchJson<PagedResult<DatasetRelease>>(`/v1/datasets${toQueryString(params)}`);
}

/**
 * Hands the browser a downloaded file from an in-memory blob. The object
 * URL is revoked immediately after the click: the browser has already read
 * the blob by then, and leaving it alive pins the whole CSV in memory for
 * the lifetime of the document.
 */
function saveBlobAsFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Where a downloaded file came from: "stored" is the snapshot captured when
 * the release was published; "rebuilt" is regenerated from current data,
 * for a release published before files were stored. null when the response
 * didn't say.
 */
export type DownloadSource = "stored" | "rebuilt" | null;

export interface DownloadedRelease {
  /** The server's SHA-256 of the bytes just sent, or null if it sent none. */
  checksum: string | null;
  source: DownloadSource;
}

function readSource(header: string | null): DownloadSource {
  return header === "stored" || header === "rebuilt" ? header : null;
}

/**
 * Downloads a release's CSV.
 *
 * Fetched rather than linked with a plain anchor so failures are visible:
 * the endpoint answers 404 for an unknown version (or an error if the
 * server fails), and an anchor would navigate the browser to that raw JSON
 * error (or silently save it as a .csv) instead of letting the page report
 * it. Sends credentials because the endpoint accepts a session as well as
 * an API key.
 *
 * A rebuilt file is saved as dataset-<version>-rebuilt.csv, matching the
 * name the server gives it, so once it is on disk it can't be taken for the
 * snapshot published under that version. Returns the checksum and source so
 * the caller can say whether the file is exactly as published. Throws
 * ApiError with the API's own message on failure.
 */
export async function downloadDatasetRelease(version: string): Promise<DownloadedRelease> {
  const path = `/v1/datasets/${encodeURIComponent(version)}/download`;
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });

  if (!response.ok) {
    throw new ApiError(await errorMessageFrom(response, path), response.status);
  }

  const source = readSource(response.headers.get("X-Dataset-Source"));
  const fileName = source === "rebuilt" ? `dataset-${version}-rebuilt.csv` : `dataset-${version}.csv`;
  saveBlobAsFile(await response.blob(), fileName);
  return { checksum: response.headers.get("X-Checksum-SHA256"), source };
}

export interface PublishReleaseBody {
  version: string;
  description: string;
  season: string;
}

/** Admin only: cuts a new release from the season's current data. Releases
 * are immutable snapshots, so correcting data never rewrites one — a
 * replacement is published instead. */
export function publishDatasetRelease(body: PublishReleaseBody): Promise<DatasetRelease> {
  return sendJson<DatasetRelease>("/v1/datasets/admin/publish", "POST", body);
}
