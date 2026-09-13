import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchTeams } from "@/lib/nbaApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { TeamBadge } from "@/components/TeamBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;

export function TeamsListPage() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["teams", { page, search: debouncedSearchTerm }],
    queryFn: () => fetchTeams({ page, pageSize: PAGE_SIZE, search: debouncedSearchTerm || undefined }),
  });

  function changeSearch(search: string) {
    setSearchTerm(search);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load teams." onRetry={() => refetch()} />;
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Teams</h1>
            {data && (
              <span className="font-mono text-[10px] tracking-[0.12em] text-locker-ink-muted uppercase">
                Showing {data.data.length} of {data.total}
              </span>
            )}
          </div>
          <input
            aria-label="Search teams"
            className="mt-4 min-w-56 border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none"
            type="search"
            placeholder="Search teams"
            value={searchTerm}
            onChange={(event) => changeSearch(event.target.value)}
          />
        </div>

        {isPending ? (
          <div className="flex min-h-64 items-center justify-center">
            <BasketballSpinner size="lg" label="Loading teams" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.data.length === 0 ? (
              <p className="text-[12.5px] text-locker-ink-muted">No teams found.</p>
            ) : (
              data?.data.map((team) => (
                <Link key={team.id} to={`/teams/${team.id}`} className="group">
                  <div className="h-full border border-landing-light bg-locker-surface p-4 transition-colors group-hover:border-locker-leather">
                    <div className="flex items-center gap-3">
                      <TeamBadge team={team} />
                      <span className="font-display text-base tracking-[0.01em] text-landing-ink uppercase">
                        {team.city} {team.name}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                        {team.abbreviation}
                      </span>
                      <span className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                        {team.conference}
                      </span>
                      <span className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                        {team.division}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
      </div>
    </div>
  );
}
