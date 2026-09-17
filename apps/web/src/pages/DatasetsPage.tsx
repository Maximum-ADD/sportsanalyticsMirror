import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/apiClient";
import { API_BASE_URL } from "@/lib/apiBase";
import { toQueryString } from "@/lib/nbaApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import type { PagedResult } from "@/types/nba";

const PAGE_SIZE = 10;

interface DatasetRelease {
  id: string;
  version: string;
  description: string;
  season: string;
  checksum: string;
  gamesCount: number;
  playersCount: number;
  eventsCount: number;
  fieldSchema: { column: string; type: string; description: string }[];
  publishedAt: string;
  publishedBy: { id: string; name: string } | null;
}

function fetchDatasetReleases(params: { page?: number; pageSize?: number } = {}): Promise<PagedResult<DatasetRelease>> {
  return fetchJson<PagedResult<DatasetRelease>>(`/v1/datasets${toQueryString(params)}`);
}

export function DatasetsPage() {
  const [page, setPage] = useState(1);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["datasetReleases", { page }],
    queryFn: () => fetchDatasetReleases({ page, pageSize: PAGE_SIZE }),
  });

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
              data?.data.map((release) => (
                <div
                  key={release.id}
                  className="border border-landing-light bg-locker-surface"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-landing-hero"
                    onClick={() =>
                      setExpandedVersion(expandedVersion === release.version ? null : release.version)
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg tracking-[0.01em] text-landing-ink">
                          {release.version}
                        </span>
                        <span className="rounded bg-landing-hero px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-locker-ink-muted uppercase">
                          {release.season}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-locker-ink-muted">{release.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-right font-mono text-[10px] text-locker-ink-muted uppercase">
                      <span>{release.playersCount} players</span>
                      <span>{release.gamesCount} games</span>
                      <span>{new Date(release.publishedAt).toLocaleDateString()}</span>
                    </div>
                    {/* Route through the same-origin /api proxy (see apiBase.ts):
                        a bare /v1 path hits this app's own dev server and renders
                        a blank page instead of downloading. */}
                    <a
                      href={`${API_BASE_URL}/v1/datasets/${release.version}/download`}
                      className="border border-landing-light bg-locker-surface px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-landing-ink uppercase transition-colors hover:border-locker-leather"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Download
                    </a>
                    <span className="text-locker-ink-muted">{expandedVersion === release.version ? "▲" : "▼"}</span>
                  </button>

                  {expandedVersion === release.version && (
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
                        <div className="overflow-hidden border border-landing-light">
                          <table className="w-full border-collapse text-left">
                            <thead>
                              <tr className="border-b border-landing-light bg-locker-surface">
                                {["Column", "Type", "Description"].map((h) => (
                                  <th
                                    key={h}
                                    className="px-2.5 py-1.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {release.fieldSchema.map((field) => (
                                <tr
                                  key={field.column}
                                  className="border-b border-landing-light last:border-b-0"
                                >
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
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
      </div>
    </div>
  );
}
