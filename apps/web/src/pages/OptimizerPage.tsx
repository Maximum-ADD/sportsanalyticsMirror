import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchLatestLineup } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatSalary(salary: number | null): string {
  return salary === null ? "—" : `$${salary.toLocaleString()}`;
}

const INTRO = (
  <>
    <h1 className="mb-1 text-xl font-semibold text-text-primary">Optimal Lineup</h1>
    <p className="mb-6 max-w-2xl text-sm text-text-secondary">
      A 5-player lineup picked by a MILP solver to maximize predicted DraftKings-style fantasy points under a
      salary cap — not just the top scorers, the best combination the budget actually allows. Salaries are
      synthetic (derived from the same predictions), not real DFS pricing.
    </p>
  </>
);

export function OptimizerPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["optimizerLineup"],
    queryFn: fetchLatestLineup,
  });

  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <div className="p-6">
        {INTRO}
        <Card>
          <CardContent className="p-6 text-sm text-text-secondary">
            No lineup has been generated yet. Run{" "}
            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">predict.py</code> then{" "}
            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">optimize.py</code> in{" "}
            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-text-primary">apps/optimizer</code> to
            produce one.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Could not load the optimized lineup." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="p-6">
        {INTRO}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    // Unreachable given the guards above (TanStack Query only leaves
    // isPending/isError both false once data is populated) — satisfies
    // TypeScript's narrowing, which doesn't follow through destructured
    // boolean flags the way it would a discriminated `status` check.
    return null;
  }

  return (
    <div className="p-6">
      {INTRO}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Predicted Points</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{data.totalPredictedPoints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Salary Used</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{formatSalary(data.totalSalary)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Budget Cap</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{formatSalary(data.budget)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Predicted Points</TableHead>
              <TableHead>Salary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-surface-card">
            {data.slots.map((slot) => (
              <TableRow key={slot.id}>
                <TableCell>
                  <Link to={`/players/${slot.player.id}`} className="text-text-primary hover:text-brand-accent">
                    {slot.player.firstName} {slot.player.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-text-secondary">
                  {slot.player.team ? (
                    <div className="flex items-center gap-2">
                      <TeamBadge team={slot.player.team} size="sm" />
                      {slot.player.team.abbreviation}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-text-secondary">{slot.player.position}</TableCell>
                <TableCell className="text-text-secondary">{slot.predictedFantasyPoints ?? "—"}</TableCell>
                <TableCell className="text-text-secondary">{formatSalary(slot.salary)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
