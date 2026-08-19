import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchTeams } from "@/lib/nbaApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { TeamBadge } from "@/components/TeamBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;
const searchInputClassName =
  "mb-4 min-w-56 rounded-md border border-border-subtle bg-surface-card px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent/50";

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
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-text-primary">Teams</h1>
      <input
        aria-label="Search teams"
        className={searchInputClassName}
        type="search"
        placeholder="Search teams"
        value={searchTerm}
        onChange={(event) => changeSearch(event.target.value)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isPending
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28" />)
          : data?.data.length === 0 ? (
              <p className="text-sm text-text-secondary">No teams found.</p>
            ) : data?.data.map((team) => (
              <Link key={team.id} to={`/teams/${team.id}`}>
                <Card className="h-full transition-colors hover:border-brand-accent/40">
                  <CardHeader className="flex-row items-center gap-3 space-y-0">
                    <TeamBadge team={team} />
                    <CardTitle className="text-base text-text-primary">
                      {team.city} {team.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-2 pt-0">
                    <Badge variant="secondary">{team.abbreviation}</Badge>
                    <Badge variant="outline">{team.conference}</Badge>
                    <Badge variant="outline">{team.division}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>

      {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </div>
  );
}
