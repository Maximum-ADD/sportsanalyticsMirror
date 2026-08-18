import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchPlayers, fetchPlayerStats, fetchTeams } from "@/lib/nbaApi";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { PlayersFilterBar, type PlayerSortKey } from "@/components/PlayersFilterBar";
import { TeamBadge } from "@/components/TeamBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 10;

export function PlayersListPage() {
  const [page, setPage] = useState(1);
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [position, setPosition] = useState<string | undefined>(undefined);
  const [sortKey, setSortKey] = useState<PlayerSortKey>("name");

  const teamsQuery = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({ pageSize: 100 }) });

  const playersQuery = useQuery({
    queryKey: ["players", { page, teamId, position }],
    queryFn: () => fetchPlayers({ page, pageSize: PAGE_SIZE, teamId, position }),
  });

  // Sorting by PPG needs each player's derived season stats, which the list
  // endpoint doesn't return (only /v1/players/:id/stats does). Fetching
  // that per row is fine at this page size but only sorts what's currently
  // on screen — a real leaderboard-style sort across the whole roster would
  // need a backend endpoint that returns aggregates in bulk.
  const playerIds = useMemo(() => playersQuery.data?.data.map((player) => player.id) ?? [], [playersQuery.data]);
  const statsQueries = useQueries({
    queries: playerIds.map((id) => ({
      queryKey: ["playerStats", id],
      queryFn: () => fetchPlayerStats(id),
      enabled: sortKey === "ppg" && playersQuery.isSuccess,
    })),
  });

  const pointsPerGameByPlayerId = useMemo(
    () => new Map(statsQueries.map((query, index) => [playerIds[index], query.data?.seasonAverages.pointsPerGame])),
    [statsQueries, playerIds]
  );

  const rows = useMemo(() => {
    const players = playersQuery.data?.data ?? [];
    if (sortKey !== "ppg") return players;
    return [...players].sort(
      (a, b) => (pointsPerGameByPlayerId.get(b.id) ?? -1) - (pointsPerGameByPlayerId.get(a.id) ?? -1)
    );
  }, [playersQuery.data, sortKey, pointsPerGameByPlayerId]);

  const isLoadingStats = sortKey === "ppg" && statsQueries.some((query) => query.isPending);

  function changeFilterAndResetPage(applyFilter: () => void) {
    applyFilter();
    setPage(1);
  }

  if (playersQuery.isError) {
    return <ErrorState message="Could not load players." onRetry={() => playersQuery.refetch()} />;
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-text-primary">Players</h1>

      <PlayersFilterBar
        teams={teamsQuery.data?.data ?? []}
        teamId={teamId}
        position={position}
        sortKey={sortKey}
        onTeamChange={(value) => changeFilterAndResetPage(() => setTeamId(value))}
        onPositionChange={(value) => changeFilterAndResetPage(() => setPosition(value))}
        onSortChange={setSortKey}
      />

      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Jersey</TableHead>
              {sortKey === "ppg" && <TableHead>PPG</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-surface-card">
            {playersQuery.isPending || isLoadingStats
              ? Array.from({ length: PAGE_SIZE }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={sortKey === "ppg" ? 5 : 4}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <Link to={`/players/${player.id}`} className="text-text-primary hover:text-brand-accent">
                        {player.firstName} {player.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      {player.team ? (
                        <Link to={`/teams/${player.team.id}`} className="flex items-center gap-2 hover:text-brand-accent">
                          <TeamBadge team={player.team} size="sm" />
                          {player.team.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-text-secondary">{player.position}</TableCell>
                    <TableCell className="text-text-secondary">#{player.jerseyNumber}</TableCell>
                    {sortKey === "ppg" && (
                      <TableCell className="text-text-secondary">
                        {pointsPerGameByPlayerId.get(player.id) ?? "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {playersQuery.data && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={playersQuery.data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
