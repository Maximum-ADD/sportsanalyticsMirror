import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchTeam, fetchPlayers } from "@/lib/nbaApi";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TeamProfilePage() {
  const { teamId } = useParams<{ teamId: string }>();

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => fetchTeam(teamId!),
    enabled: !!teamId,
  });

  const rosterQuery = useQuery({
    queryKey: ["players", { teamId }],
    queryFn: () => fetchPlayers({ teamId }),
    enabled: !!teamId,
  });

  if (teamQuery.isError) {
    return <ErrorState message="Could not load team." onRetry={() => teamQuery.refetch()} />;
  }
  if (rosterQuery.isError) {
    return <ErrorState message="Could not load roster." onRetry={() => rosterQuery.refetch()} />;
  }

  if (teamQuery.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const team = teamQuery.data;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <TeamBadge team={team} size="md" className="size-14 text-base" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {team.city} {team.name}
          </h1>
          <div className="mt-1 flex gap-2">
            <Badge variant="secondary">{team.abbreviation}</Badge>
            <Badge variant="outline">{team.conference}</Badge>
            <Badge variant="outline">{team.division}</Badge>
          </div>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-medium text-text-secondary">Roster</h2>
      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Jersey</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-surface-card">
            {rosterQuery.isPending
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={3}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rosterQuery.data?.data.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <Link to={`/players/${player.id}`} className="text-text-primary hover:text-brand-accent">
                        {player.firstName} {player.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-text-secondary">{player.position}</TableCell>
                    <TableCell className="text-text-secondary">#{player.jerseyNumber}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
