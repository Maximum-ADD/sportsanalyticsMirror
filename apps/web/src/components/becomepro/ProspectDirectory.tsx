import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Pagination } from "@/components/Pagination";
import { ProRankBadge } from "@/components/becomepro/ProRankBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PROSPECT_DIRECTORY_QUERY_KEY, fetchProspectDirectory } from "@/lib/becomeProApi";
import {
  COMPETITION_LEVELS_IN_ORDER,
  COMPETITION_LEVEL_LABELS,
  COMPETITION_LEVEL_SHORT_LABELS,
} from "@/lib/prospectValue";
import type { CompetitionLevel } from "@/types/nba";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          All prospects
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      {children}
    </div>
  );
}

/**
 * Everyone who has logged a season, ranked or not.
 *
 * Deliberately a separate surface from the value board. A prospect below the
 * games floor is never on the board, so routing "browse other players" through
 * the leaderboard would quietly redefine it as "browse the top of a value
 * board" — and the people most likely to be looked up by a friend are exactly
 * the ones who have just started.
 */
export function ProspectDirectory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<CompetitionLevel | "">("");
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...PROSPECT_DIRECTORY_QUERY_KEY, { page, search: debouncedSearch, level }],
    queryFn: () =>
      fetchProspectDirectory({
        page,
        search: debouncedSearch || undefined,
        level: level || undefined,
      }),
  });

  return (
    <Shell>
      <div className="mb-3 flex flex-wrap gap-2.5">
        <div>
          <label htmlFor="prospect-directory-search" className="sr-only">
            Search prospects by name
          </label>
          <input
            id="prospect-directory-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search prospects"
            className="w-full max-w-64 border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink focus:border-locker-leather focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="prospect-directory-level" className="sr-only">
            Filter by competition level
          </label>
          <select
            id="prospect-directory-level"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as CompetitionLevel | "");
              setPage(1);
            }}
            className="border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink focus:border-locker-leather focus:outline-none"
          >
            <option value="">All levels</option>
            {COMPETITION_LEVELS_IN_ORDER.map((option) => (
              <option key={option} value={option}>
                {COMPETITION_LEVEL_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isPending && (
        <div role="status" aria-label="Loading prospects" className="animate-pulse space-y-1.5">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-10 bg-landing-hero" />
          ))}
        </div>
      )}

      {isError && (
        <>
          <p className="text-[12px] text-locker-bad">Could not load the prospect list.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-[12px] text-locker-leather underline underline-offset-[3px]"
          >
            Try again
          </button>
        </>
      )}

      {data && data.data.length === 0 && (
        <p className="border border-dashed border-landing-light bg-landing-hero p-5 text-center text-[12.5px] text-locker-ink-muted">
          No prospects match that search yet.
        </p>
      )}

      {data && data.data.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((entry) => (
              <li key={entry.username}>
                <Link
                  to={`/become-pro/${entry.username}`}
                  className="flex items-center gap-2.5 border border-landing-light bg-landing-hero p-2.5 transition-colors hover:border-locker-leather"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[12.5px] text-landing-ink uppercase">
                      {entry.displayName}
                    </p>
                    <p className="truncate text-[10.5px] text-locker-ink-muted">
                      {COMPETITION_LEVEL_SHORT_LABELS[entry.competitionLevel]} ·{" "}
                      {entry.gamesLogged} {entry.gamesLogged === 1 ? "game" : "games"} ·{" "}
                      {entry.pointsPerGame.toFixed(1)} PPG
                    </p>
                  </div>
                  {/* Absent for anyone below the floor, which is most of a
                      healthy directory — the games count above already says
                      where they are. */}
                  <ProRankBadge rank={entry.rank} className="shrink-0 text-locker-leather" />
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
            tone="locker"
          />
        </>
      )}
    </Shell>
  );
}
