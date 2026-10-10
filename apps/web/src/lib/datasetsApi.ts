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
  gamesCount: number;
  playersCount: number;
  eventsCount: number;
  /** Set when an event correction landed after this release was cut, so the
   * snapshot no longer matches the data it was derived from. Stale releases
   * refuse to download — a replacement has to be published instead. */
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
 * Downloads a release's CSV.
 *
 * Fetched rather than linked with a plain anchor so failures are visible:
 * the endpoint answers 404 for an unknown version and 409 for a release
 * gone stale after a correction, and an anchor would navigate the browser
 * to that raw JSON error (or silently save it as a .csv) instead of
 * letting the page report it. Sends credentials because the endpoint
 * accepts a session as well as an API key.
 *
 * Returns the server's SHA-256 of the bytes just sent, so the caller can
 * show whether the download still matches the release's published
 * checksum. Throws ApiError with the API's own message on failure.
 */
export async function downloadDatasetRelease(version: string): Promise<{ checksum: string | null }> {
  const path = `/v1/datasets/${encodeURIComponent(version)}/download`;
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });

  if (!response.ok) {
    throw new ApiError(await errorMessageFrom(response, path), response.status);
  }

  saveBlobAsFile(await response.blob(), `dataset-${version}.csv`);
  return { checksum: response.headers.get("X-Checksum-SHA256") };
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
