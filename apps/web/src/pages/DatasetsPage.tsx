import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  downloadDatasetRelease,
  fetchDatasetReleases,
  publishDatasetRelease,
  type DatasetRelease,
  type ReleaseSortField,
  type SortDirection,
} from "@/lib/datasetsApi";
import { useMe } from "@/lib/useMe";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 10;

const INPUT_CLASS =
  "border border-landing-light bg-locker-surface px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-landing-ink uppercase focus:border-locker-leather focus:outline-none";
const BUTTON_CLASS =
  "border border-landing-light bg-locker-surface px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-40";

const SORT_FIELD_OPTIONS: { value: ReleaseSortField; label: string }[] = [
  { value: "date", label: "Publish date" },
  { value: "season", label: "Season" },
];
const SORT_DIRECTION_OPTIONS: { value: SortDirection; label: string }[] = [
  { value: "desc", label: "Newest first" },
  { value: "asc", label: "Oldest first" },
];

/**
 * Admin-only control for cutting a new release from a season's current
 * data. It exists because releases are immutable: correcting an event
 * marks every release for that season stale, and a stale release refuses
 * to download. Without a way to publish a replacement, the first
 * correction would permanently take that season's downloads offline.
 */
function PublishReleaseForm({ onPublished }: { onPublished: () => void }) {
  const [version, setVersion] = useState("");
  const [season, setSeason] = useState("");
  const [description, setDescription] = useState("");

  const publishMutation = useMutation({
    mutationFn: () =>
      publishDatasetRelease({
        version: version.trim(),
        season: season.trim(),
        description: description.trim(),
      }),
    onSuccess: () => {
      setVersion("");
      setSeason("");
      setDescription("");
      onPublished();
    },
  });

  const canSubmit =
    version.trim().length > 0 && season.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="mb-6 border border-landing-light bg-locker-surface p-4">
      <h2 className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        Publish a release (admin)
      </h2>
      <p className="mt-1 text-[12px] text-locker-ink-muted">
        Cuts a new immutable snapshot of a season's current data. Publish a replacement after a
        correction — existing releases stay stale on purpose, so earlier analysis stays reproducible.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          aria-label="Release version"
          className={INPUT_CLASS}
          placeholder="Version (e.g. 2025-26.2)"
          value={version}
          onChange={(event) => setVersion(event.target.value)}
        />
        <input
          aria-label="Release season"
          className={INPUT_CLASS}
          placeholder="Season (e.g. 2025-26)"
          value={season}
          onChange={(event) => setSeason(event.target.value)}
        />
        <input
          aria-label="Release description"
          className={`${INPUT_CLASS} min-w-64 flex-1 normal-case`}
          placeholder="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={!canSubmit || publishMutation.isPending}
          onClick={() => publishMutation.mutate()}
        >
          {publishMutation.isPending ? "Publishing…" : "Publish"}
        </button>
      </div>
      {publishMutation.isError && (
        <p className="mt-2 text-[11px] text-locker-bad">{publishMutation.error.message}</p>
      )}
      {publishMutation.isSuccess && (
        <p className="mt-2 text-[11px] text-locker-good">
          Published {publishMutation.data.version}.
        </p>
      )}
    </div>
  );
}

/**
 * Download button for one release, with its own pending and error state.
 * Each release tracks its own status rather than sharing one at page level
 * so a failure names the release it belongs to.
 */
type ChecksumVerdict = "match" | "mismatch" | "unverified";

/**
 * Compares the checksum of the bytes just downloaded with the one recorded
 * when the release was published.
 *
 * The CSV is rebuilt from live data on every download rather than stored,
 * so a re-ingestion since publishing changes its contents under the same
 * version name. This is the only point where that drift becomes visible.
 * "unverified" means the response carried no checksum header, so neither a
 * match nor a mismatch can honestly be claimed.
 */
function compareChecksums(downloadedChecksum: string | null, publishedChecksum: string): ChecksumVerdict {
  if (!downloadedChecksum) return "unverified";
  return downloadedChecksum.toLowerCase() === publishedChecksum.toLowerCase() ? "match" : "mismatch";
}

function ChecksumNotice({ verdict, version }: { verdict: ChecksumVerdict; version: string }) {
  if (verdict === "match") {
    return <span className="text-right text-[10.5px] text-locker-good">✓ Matches published checksum</span>;
  }
  if (verdict === "unverified") {
    return <span className="text-right text-[10.5px] text-locker-ink-muted">Checksum could not be verified</span>;
  }
  return (
    <span role="alert" className="max-w-72 text-right text-[10.5px] text-yellow-700">
      Doesn't match the published checksum — the data has changed since {version} was released, so
      this file won't reproduce analysis made against it.
    </span>
  );
}

function DownloadReleaseButton({ release }: { release: DatasetRelease }) {
  const downloadMutation = useMutation({
    mutationFn: () => downloadDatasetRelease(release.version),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
      >
        {downloadMutation.isPending ? "Preparing…" : "Download"}
      </button>
      {downloadMutation.isError && (
        <span className="max-w-64 text-right text-[10.5px] text-locker-bad">
          {downloadMutation.error.message}
        </span>
      )}
      {downloadMutation.isSuccess && (
        <ChecksumNotice
          verdict={compareChecksums(downloadMutation.data.checksum, release.checksum)}
          version={release.version}
        />
      )}
    </div>
  );
}

function ReleaseDetails({ release }: { release: DatasetRelease }) {
  return (
    <div className="border-t border-landing-light bg-landing-hero p-4">
      <div className="mb-3">
        <h3 className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          Checksum (SHA-256)
        </h3>
        <code className="mt-1 block break-all font-mono text-[11px] text-landing-ink">
          {release.checksum}
        </code>
      </div>

      <div>
        <h3 className="mb-2 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          Field Schema
        </h3>
        <div className="overflow-x-auto border border-landing-light">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-locker-surface">
                {["Column", "Type", "Description"].map((header) => (
                  <th
                    key={header}
                    className="px-2.5 py-1.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {release.fieldSchema.map((field) => (
                <tr key={field.column} className="border-b border-landing-light last:border-b-0">
                  <td className="px-2.5 py-1.5 font-mono text-[11px] text-landing-ink">
                    {field.column}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-[11px] text-locker-ink-muted">
                    {field.type}
                  </td>
                  <td className="px-2.5 py-1.5 text-[11px] text-locker-ink-muted">
                    {field.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {release.publishedBy && (
        <p className="mt-3 text-[11px] text-locker-ink-muted">
          Published by {release.publishedBy.name}
        </p>
      )}
    </div>
  );
}

function ReleaseRow({ release }: { release: DatasetRelease }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = `release-details-${release.id}`;

  return (
    <div className="border border-landing-light bg-locker-surface">
      {/* The expand toggle and the download control are siblings, not
          nested: an interactive element inside a <button> is invalid HTML
          and browsers disagree about which one a click activates. */}
      <div className="flex flex-wrap items-center gap-4 p-4">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          className="min-w-0 flex-1 text-left transition-colors hover:opacity-80"
          onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg tracking-[0.01em] text-landing-ink">
              {release.version}
            </span>
            <span className="rounded bg-landing-hero px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-locker-ink-muted uppercase">
              {release.season}
            </span>
            {release.isStale && (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-yellow-800 uppercase">
                Stale
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-locker-ink-muted">{release.description}</p>
          {release.isStale && (
            <p className="mt-1 text-[11px] text-yellow-700">
              A correction landed after this snapshot was cut, so it no longer matches the source
              data. It still downloads as originally published, to reproduce earlier analysis; use a
              newer release for the corrected figures.
            </p>
          )}
        </button>

        <div className="flex flex-wrap items-center gap-4 text-right font-mono text-[10px] text-locker-ink-muted uppercase">
          <span>{release.playersCount} players</span>
          <span>{release.gamesCount} games</span>
          <span>{new Date(release.publishedAt).toLocaleDateString()}</span>
        </div>

        <DownloadReleaseButton release={release} />

        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          aria-label={isExpanded ? `Hide ${release.version} details` : `Show ${release.version} details`}
          className="text-locker-ink-muted transition-colors hover:text-landing-ink"
          onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
        >
          {isExpanded ? "▲" : "▼"}
        </button>
      </div>

      {isExpanded && (
        <div id={detailsId}>
          <ReleaseDetails release={release} />
        </div>
      )}
    </div>
  );
}

export function DatasetsPage() {
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<ReleaseSortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: me } = useMe();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["datasetReleases", { page, sortField, sortDirection }],
    queryFn: () =>
      fetchDatasetReleases({ page, pageSize: PAGE_SIZE, sort: sortField, order: sortDirection }),
  });

  // Changing the sort re-orders the whole list, so page 2 of the old order
  // means nothing in the new one — go back to the first page.
  function changeSortField(field: ReleaseSortField) {
    setSortField(field);
    setPage(1);
  }

  function changeSortDirection(direction: SortDirection) {
    setSortDirection(direction);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load dataset releases." onRetry={() => refetch()} />;
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Datasets</h1>
          <p className="mt-2 text-[12.5px] text-locker-ink-muted">
            Versioned data releases with checksums and field schemas. Download a release CSV to
            reproduce analysis against a known snapshot of the data.
          </p>
        </div>

        {me?.role === "ADMIN" && <PublishReleaseForm onPublished={() => refetch()} />}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label
            htmlFor="release-sort-field"
            className="font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase"
          >
            Sort by
          </label>
          <select
            id="release-sort-field"
            className={INPUT_CLASS}
            value={sortField}
            onChange={(event) => changeSortField(event.target.value as ReleaseSortField)}
          >
            {SORT_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort direction"
            className={INPUT_CLASS}
            value={sortDirection}
            onChange={(event) => changeSortDirection(event.target.value as SortDirection)}
          >
            {SORT_DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {isPending ? (
          <div className="flex min-h-64 items-center justify-center">
            <BasketballSpinner size="lg" label="Loading releases" />
          </div>
        ) : (
          <div className="space-y-3">
            {data?.data.length === 0 ? (
              <p className="py-12 text-center text-[12.5px] text-locker-ink-muted">
                No dataset releases published yet.
              </p>
            ) : (
              data?.data.map((release) => <ReleaseRow key={release.id} release={release} />)
            )}
          </div>
        )}

        {data && (
          <Pagination
            tone="locker"
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
