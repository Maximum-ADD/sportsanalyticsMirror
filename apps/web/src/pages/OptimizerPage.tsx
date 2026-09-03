import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchLatestLineup, fetchPlayerPrediction } from "@/lib/nbaApi";
import { ApiError } from "@/lib/apiClient";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerSearchCombobox } from "@/components/PlayerSearchCombobox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LineupSlot, Player } from "@/types/nba";

// A fantasy lineup is a 5-player roster (see apps/optimizer/optimize.py) —
// local "what if" edits stay within that shape rather than growing unbounded.
const MAX_LINEUP_SIZE = 5;

// Mirrors the real MILP constraints in apps/optimizer/optimize.py
// (MINIMUM_GUARDS/MINIMUM_FORWARDS, checked the same way: a substring match
// against position, e.g. "G-F" counts as both) — so a locally-edited lineup
// that violates them is flagged with the same rule the actual solver uses.
const MINIMUM_GUARDS = 1;
const MINIMUM_FORWARDS = 1;

function formatSalary(salary: number | null): string {
  return salary === null ? "—" : `$${salary.toLocaleString("en-US")}`;
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

  // A local, never-persisted copy of the slots — null until the user makes
  // a first edit, so the page shows the server's real totals verbatim until
  // then. Reset whenever a different lineup loads.
  const [isEditingLineup, setIsEditingLineup] = useState(false);
  const [editedSlots, setEditedSlots] = useState<LineupSlot[] | null>(null);
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);

  useEffect(() => {
    setIsEditingLineup(false);
    setEditedSlots(null);
    setBudgetOverride(null);
  }, [data?.id]);

  function resetLineupEdits() {
    setEditedSlots(null);
    setBudgetOverride(null);
  }

  function removeSlot(slotId: string) {
    setEditedSlots((previous) => (previous ?? data!.slots).filter((slot) => slot.id !== slotId));
  }

  async function addPlayer(player: Player) {
    const prediction = await fetchPlayerPrediction(player.id);
    setEditedSlots((previous) => [
      ...(previous ?? data!.slots),
      {
        id: player.id,
        lineupId: data!.id,
        playerId: player.id,
        player,
        predictedFantasyPoints: prediction.predictedFantasyPoints,
        salary: prediction.salary,
      },
    ]);
  }

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

  const slots = editedSlots ?? data.slots;
  const hasLineupEdits = editedSlots !== null || budgetOverride !== null;
  const totalPredictedPoints = editedSlots !== null
    ? slots.reduce((sum, slot) => sum + (slot.predictedFantasyPoints ?? 0), 0)
    : data.totalPredictedPoints;
  const totalSalary = editedSlots !== null
    ? slots.reduce((sum, slot) => sum + (slot.salary ?? 0), 0)
    : data.totalSalary;
  const effectiveBudget = budgetOverride ?? data.budget;
  const isOverBudget = totalSalary > effectiveBudget;
  const excludedPlayerIds = slots.map((slot) => slot.playerId);

  const guardCount = slots.filter((slot) => slot.player.position.includes("G")).length;
  const forwardCount = slots.filter((slot) => slot.player.position.includes("F")).length;
  const missingPositions = [
    guardCount < MINIMUM_GUARDS && "a guard",
    forwardCount < MINIMUM_FORWARDS && "a forward",
  ].filter((requirement): requirement is string => !!requirement);

  return (
    <div className="p-6">
      {INTRO}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Predicted Points</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{totalPredictedPoints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Salary Used</div>
            <div className={`mt-1 text-2xl font-semibold ${isOverBudget ? "text-red-400" : "text-text-primary"}`}>
              {formatSalary(totalSalary)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Budget Cap</div>
            {isEditingLineup ? (
              <input
                aria-label="Edit budget cap"
                type="number"
                value={effectiveBudget}
                onChange={(event) => setBudgetOverride(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-2xl font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
              />
            ) : (
              <div className="mt-1 text-2xl font-semibold text-text-primary">{formatSalary(effectiveBudget)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-text-secondary">Lineup</h2>
        <div className="flex items-center gap-2">
          {hasLineupEdits && (
            <button
              type="button"
              onClick={resetLineupEdits}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Reset
            </button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditingLineup((previous) => !previous)}
          >
            {isEditingLineup ? "Done editing" : "Edit lineup"}
          </Button>
        </div>
      </div>
      {isEditingLineup && (
        <p className="mb-2 text-xs text-text-muted">
          Editing locally — not saved, resets when you refresh or leave this page.
        </p>
      )}
      {missingPositions.length > 0 && (
        <p className="mb-4 text-xs text-red-400">
          This lineup doesn&apos;t meet the optimizer&apos;s position requirements — it needs at least{" "}
          {missingPositions.join(" and ")}.
        </p>
      )}
      {isEditingLineup && slots.length < MAX_LINEUP_SIZE && (
        <div className="mb-4 max-w-sm">
          <PlayerSearchCombobox
            onSelect={addPlayer}
            excludedPlayerIds={excludedPlayerIds}
            placeholder="Add a player to the lineup"
            label="Add a player to the lineup"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Predicted Points</TableHead>
              <TableHead>Salary</TableHead>
              {isEditingLineup && <TableHead className="sr-only">Remove</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-surface-card">
            {slots.map((slot) => (
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
                {isEditingLineup && (
                  <TableCell>
                    <button
                      type="button"
                      aria-label={`Remove ${slot.player.firstName} ${slot.player.lastName} from the lineup`}
                      className="rounded-md px-1.5 text-base leading-none text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                      onClick={() => removeSlot(slot.id)}
                    >
                      ✕
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
