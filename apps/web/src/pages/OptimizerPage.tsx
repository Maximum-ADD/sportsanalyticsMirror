import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchLatestLineup, fetchPlayerPrediction, fetchPlayerPredictions } from "@/lib/nbaApi";
import { saveLineup, type SaveLineupParams } from "@/lib/meApi";
import { useMe } from "@/lib/useMe";
import { ApiError } from "@/lib/apiClient";
import { ErrorState } from "@/components/ErrorState";
import { HitMissPill } from "@/components/HitMissPill";
import { Reveal } from "@/components/landing/Reveal";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { PlayerSearchCombobox } from "@/components/PlayerSearchCombobox";
import { PageLoading } from "@/components/ui/loading-overlay";
import type { LineupSlot, Player, PlayerPredictionListItem, PlayerPredictionSummary } from "@/types/nba";

// A fantasy lineup is a 5-player roster (see apps/optimizer/optimize.py) —
// local "what if" edits stay within that shape rather than growing unbounded.
const LINEUP_SIZE = 5;

// Mirrors the real MILP constraints in apps/optimizer/optimize.py
// (MINIMUM_GUARDS/MINIMUM_FORWARDS, checked the same way: a substring match
// against position, e.g. "G-F" counts as both) — so a locally-edited lineup
// is judged by exactly the rule the actual solver uses.
const MINIMUM_GUARDS = 1;
const MINIMUM_FORWARDS = 1;

// How many value suggestions the edit mode shows at once — enough to cover
// the realistic options without the panel overwhelming the lineup table.
const SUGGESTION_COUNT = 4;

// Matches the API's MAX_LINEUP_NAME_LENGTH in saved-lineups.controller.ts —
// the server rejects anything longer, so the box caps typing at the same
// bound rather than the save failing after the click.
const MAX_LINEUP_NAME_LENGTH = 50;

const MODULE_HEADING_CLASS =
  "font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase";
const MODULE_RULE_CLASS = "h-px flex-1 bg-landing-light";

function formatSalary(salary: number | null): string {
  return salary === null ? "—" : `$${salary.toLocaleString("en-US")}`;
}

function formatPoints(points: number | null): string {
  return points === null ? "—" : points.toFixed(1);
}

// Derived here, not stored (and not a field the API returns): a ratio of the
// two numbers already on the row. It's what makes a cheap high-floor player
// visibly better value than an expensive star.
function formatDollarsPerPoint(slot: LineupSlot): string {
  const { salary, predictedFantasyPoints } = slot;
  if (salary === null || predictedFantasyPoints === null || predictedFantasyPoints <= 0) {
    return "—";
  }
  return `$${Math.round(salary / predictedFantasyPoints).toLocaleString("en-US")}/pt`;
}

function formatTimeAgo(isoDate: string): string {
  const elapsedInMinutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000);
  if (elapsedInMinutes < 1) return "just now";
  if (elapsedInMinutes < 60) return `${elapsedInMinutes}m ago`;
  const elapsedInHours = Math.floor(elapsedInMinutes / 60);
  if (elapsedInHours < 24) return `${elapsedInHours}h ago`;
  return `${Math.floor(elapsedInHours / 24)}d ago`;
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3.5">
      <span className="font-mono text-[10px] tracking-[0.2em] text-locker-leather">{eyebrow}</span>
      <h2 className={MODULE_HEADING_CLASS}>{title}</h2>
      <span aria-hidden className={MODULE_RULE_CLASS} />
    </div>
  );
}

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-landing-light bg-locker-surface p-4">
      <div className="font-mono text-[10px] tracking-[0.14em] text-locker-ink-muted uppercase">{label}</div>
      {children}
    </div>
  );
}

function ConstraintRow({ label, detail, met }: { label: string; detail: string; met: boolean }) {
  // The met/unmet pill is the shared HitMissPill badge — same green/red
  // treatment as "Model hit"/"Model miss", so the solver checks read like
  // the rest of the app's verdicts. Glyph AND word, never colour alone.
  return (
    <li className="flex items-center justify-between gap-3 border border-landing-light bg-landing-hero px-3 py-2.5">
      <div>
        <p className="text-[12.5px] text-landing-ink">{label}</p>
        <p className="font-mono text-[9.5px] tracking-[0.08em] text-locker-ink-muted uppercase">{detail}</p>
      </div>
      <HitMissPill hit={met} hitLabel="met" missLabel="unmet" />
    </li>
  );
}

// SaveLineupDialog — the name prompt that stands between clicking "Save
// lineup" and the POST. Every saved lineup gets a name (the API rejects a
// blank one), so a save can't go through without one. Escape or Cancel
// closes without saving and returns focus to the save button; Enter submits.
function SaveLineupDialog({
  name,
  isPending,
  errorMessage,
  onNameChange,
  onCancel,
  onSubmit,
}: {
  name: string;
  isPending: boolean;
  errorMessage: string | null;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape cancels; Tab cycles inside the dialog so keyboard users can't
  // fall through to the page behind the backdrop.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, input");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label="Cancel naming the lineup"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-landing-ink/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-lineup-dialog-title"
        className="relative w-full max-w-sm border border-landing-light bg-locker-surface p-5"
      >
        <h2 id="save-lineup-dialog-title" className="font-display text-sm tracking-[0.14em] text-landing-ink uppercase">
          Name this lineup
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-locker-ink-muted">
          Every saved lineup gets a name so you can tell it apart on your profile later.
        </p>
        <form
          className="mt-4"
          onSubmit={(event) => {
            // Enter in the name box saves — a prompt you can confirm from the
            // keyboard behaves like a dialog should.
            event.preventDefault();
            onSubmit();
          }}
        >
          <label
            htmlFor="save-lineup-name"
            className="font-mono text-[10px] tracking-[0.14em] text-locker-ink-muted uppercase"
          >
            Lineup name
          </label>
          <input
            id="save-lineup-name"
            autoFocus
            type="text"
            required
            maxLength={MAX_LINEUP_NAME_LENGTH}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="mt-1.5 w-full border border-landing-light bg-landing-hero px-2.5 py-2 font-mono text-[11.5px] tracking-[0.06em] text-landing-ink focus:border-locker-leather focus:outline-none"
          />
          {errorMessage && (
            <p role="alert" className="mt-2 font-mono text-[10.5px] tracking-[0.08em] text-locker-bad uppercase">
              {errorMessage}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-locker-ink-muted uppercase transition-colors hover:text-landing-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || name.trim().length === 0}
              className="border border-landing-light bg-landing-ink px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-hero uppercase transition-colors hover:bg-locker-leather disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save lineup"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PageHeader({ solvedAt, budget }: { solvedAt?: string; budget?: number }) {
  return (
    <header className="mb-6 border border-landing-light bg-locker-surface p-6">
      <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-locker-leather uppercase">
        Fantasy optimizer · module 01
      </p>
      <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Optimal lineup</h1>
      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
        A 5-player lineup picked by a MILP solver to maximize predicted DraftKings-style fantasy points under a
        salary cap — not just the top scorers, the best combination the budget actually allows. To be straight with
        you: the salaries are synthetic, derived from the same predictions rather than real DFS pricing, so treat
        them as the puzzle's stakes, not market values.
      </p>
      {solvedAt && (
        <p className="mt-3 font-mono text-[10px] tracking-[0.1em] text-locker-ink-muted uppercase">
          Solved {formatTimeAgo(solvedAt)}
          {budget !== undefined && ` · budget ${formatSalary(budget)}`}
        </p>
      )}
    </header>
  );
}

export function OptimizerPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["optimizerLineup"],
    queryFn: fetchLatestLineup,
  });
  const { session } = useMe();
  const queryClient = useQueryClient();

  // A local, never-persisted copy of the slots — null until the user makes
  // a first edit, so the page shows the server's real totals verbatim until
  // then. Reset whenever a different lineup loads.
  const [isEditingLineup, setIsEditingLineup] = useState(false);
  const [editedSlots, setEditedSlots] = useState<LineupSlot[] | null>(null);
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  // The name the save will carry to the profile card. Reset along with the
  // other edits whenever a different lineup loads.
  const [lineupName, setLineupName] = useState("");
  // The name prompt stands between the save click and the POST — opened by
  // the save button, closed by Cancel/Escape or by the save succeeding.
  const [isNamePromptOpen, setIsNamePromptOpen] = useState(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsEditingLineup(false);
    setEditedSlots(null);
    setBudgetOverride(null);
    setLineupName("");
    setIsNamePromptOpen(false);
  }, [data?.id]);

  const saveMutation = useMutation({
    mutationFn: (params: SaveLineupParams) => saveLineup(params),
    onSuccess: () => {
      setIsNamePromptOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["savedLineups"] });
    },
  });

  function closeNamePrompt() {
    setIsNamePromptOpen(false);
    // Back to the save button — the dialog took focus on open (autoFocus),
    // so closing it without moving focus would drop keyboard users on the
    // page body.
    saveButtonRef.current?.focus();
  }

  // Latest predictions for every player, fetched only while the user could
  // actually add someone — backs the value-suggestion panel. One round trip
  // for the whole pool, not one lookup per candidate.
  const currentSlotCount = (editedSlots ?? data?.slots ?? []).length;
  const suggestionsQuery = useQuery({
    queryKey: ["playerPredictions"],
    queryFn: fetchPlayerPredictions,
    enabled: isEditingLineup && currentSlotCount < LINEUP_SIZE,
  });

  function resetLineupEdits() {
    setEditedSlots(null);
    setBudgetOverride(null);
    saveMutation.reset();
  }

  function removeSlot(slotId: string) {
    setEditedSlots((previous) => (previous ?? data!.slots).filter((slot) => slot.id !== slotId));
    saveMutation.reset();
  }

  // An optional pre-known prediction lets the suggestion panel add a player
  // without a second lookup; the combobox path doesn't have one, so it
  // fetches the player's latest numbers the same way it always did.
  async function addPlayer(player: Player, prediction?: PlayerPredictionSummary) {
    const latest = prediction ?? (await fetchPlayerPrediction(player.id));
    setEditedSlots((previous) => [
      ...(previous ?? data!.slots),
      {
        id: player.id,
        lineupId: data!.id,
        playerId: player.id,
        player,
        predictedFantasyPoints: latest.predictedFantasyPoints,
        salary: latest.salary,
      },
    ]);
    saveMutation.reset();
  }

  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <div className="min-h-full bg-landing-hero">
        <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8">
          <Reveal>
            <PageHeader />
            <p className="border border-landing-light bg-locker-surface p-5 text-[12.5px] text-locker-ink-muted">
              No lineup has been generated yet. Run{" "}
              <code className="bg-landing-hero px-1.5 py-0.5 font-mono text-[11px] text-landing-ink">predict.py</code>{" "}
              then{" "}
              <code className="bg-landing-hero px-1.5 py-0.5 font-mono text-[11px] text-landing-ink">optimize.py</code>{" "}
              in{" "}
              <code className="bg-landing-hero px-1.5 py-0.5 font-mono text-[11px] text-landing-ink">apps/optimizer</code>{" "}
              to produce one.
            </p>
          </Reveal>
        </div>
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Could not load the optimized lineup." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="min-h-full bg-landing-hero">
        <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8">
          <Reveal>
            <PageHeader />
            <PageLoading label="Loading optimized lineup" />
          </Reveal>
        </div>
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
  const salaryHeadroomInDollars = Math.abs(effectiveBudget - totalSalary);
  const percentOfCapUsed = Math.round((totalSalary / effectiveBudget) * 100);
  const excludedPlayerIds = slots.map((slot) => slot.playerId);

  const guardCount = slots.filter((slot) => slot.player.position.includes("G")).length;
  const forwardCount = slots.filter((slot) => slot.player.position.includes("F")).length;
  const uniquePlayerCount = new Set(slots.map((slot) => slot.playerId)).size;
  const playersNeeded = LINEUP_SIZE - slots.length;

  // Checked against the current board, in the solver's own terms (see
  // optimize.py) — the save button stays disabled until every one is met.
  const constraints = [
    {
      key: "size",
      label: `Exactly ${LINEUP_SIZE} players`,
      detail: `${slots.length} of ${LINEUP_SIZE} on the board`,
      met: slots.length === LINEUP_SIZE,
      hint:
        playersNeeded > 0
          ? `This board needs ${playersNeeded} more ${playersNeeded === 1 ? "player" : "players"} before it can be saved.`
          : `This board has ${-playersNeeded} too many players — remove ${-playersNeeded === 1 ? "one" : "some"} before it can be saved.`,
    },
    {
      key: "guards",
      label: `At least ${MINIMUM_GUARDS} guard`,
      detail: `${guardCount} on the board`,
      met: guardCount >= MINIMUM_GUARDS,
      hint: "This board needs at least one guard before it can be saved.",
    },
    {
      key: "forwards",
      label: `At least ${MINIMUM_FORWARDS} forward`,
      detail: `${forwardCount} on the board`,
      met: forwardCount >= MINIMUM_FORWARDS,
      hint: "This board needs at least one forward before it can be saved.",
    },
    {
      key: "cap",
      label: "Within the salary cap",
      detail: `${formatSalary(totalSalary)} of ${formatSalary(effectiveBudget)}`,
      met: !isOverBudget,
      hint: `This board is ${formatSalary(salaryHeadroomInDollars)} over the cap — swap a player or raise the budget before saving.`,
    },
    {
      key: "duplicates",
      label: "No duplicate players",
      detail: `${uniquePlayerCount} unique on the board`,
      met: uniquePlayerCount === slots.length,
      hint: "This board has the same player twice — remove the duplicate before saving.",
    },
  ];

  const firstUnmetConstraint = constraints.find((constraint) => !constraint.met);
  // Slots only lose their price when a manually-added player has no
  // prediction on record; freezing a made-up $0 would fabricate drift later.
  const everySlotIsPriced = slots.every(
    (slot) => slot.predictedFantasyPoints !== null && slot.salary !== null
  );

  // Value suggestions for edit mode: everyone not already on the board whose
  // salary fits the remaining budget, best dollars-per-point first, with
  // players who fill an unmet position need boosted above pure value picks.
  const remainingBudgetInDollars = effectiveBudget - totalSalary;
  const needsGuard = guardCount < MINIMUM_GUARDS;
  const needsForward = forwardCount < MINIMUM_FORWARDS;
  function fillsPositionNeed(item: PlayerPredictionListItem): boolean {
    return (
      (needsGuard && item.player.position.includes("G")) ||
      (needsForward && item.player.position.includes("F"))
    );
  }
  const suggestedAdds = (suggestionsQuery.data ?? [])
    .filter(
      (item) =>
        !excludedPlayerIds.includes(item.playerId) &&
        item.salary <= remainingBudgetInDollars &&
        item.predictedFantasyPoints > 0
    )
    .sort(
      (a, b) =>
        Number(fillsPositionNeed(b)) - Number(fillsPositionNeed(a)) ||
        a.salary / a.predictedFantasyPoints - b.salary / b.predictedFantasyPoints
    )
    .slice(0, SUGGESTION_COUNT);

  let footerMessage: string;
  if (firstUnmetConstraint) {
    footerMessage = firstUnmetConstraint.hint;
  } else if (!everySlotIsPriced) {
    footerMessage = "Every player needs a current prediction before this board can be saved.";
  } else if (!session) {
    footerMessage = "Sign in to save this lineup to your profile.";
  } else {
    footerMessage = "This board meets every solver constraint — save it to your profile.";
  }

  const canSave = !firstUnmetConstraint && everySlotIsPriced && session !== null && !saveMutation.isPending;

  function handleSaveLineup() {
    // The name is required (the dialog blocks an empty one), so it's sent
    // verbatim after trimming — the API rejects a blank.
    saveMutation.mutate({
      budget: effectiveBudget,
      name: lineupName.trim(),
      slots: slots.map((slot) => ({
        playerId: slot.playerId,
        predictedPointsAtSave: slot.predictedFantasyPoints ?? 0,
        salaryAtSave: slot.salary ?? 0,
      })),
    });
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8">
        <Reveal replay={false}>
          <PageHeader solvedAt={data.createdAt} budget={data.budget} />
        </Reveal>

        <Reveal replay={false} delay={1}>
          <section className="mb-6">
            <SectionHeading eyebrow="02" title="Lineup totals" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile label="Projected points">
                <div className="mt-1 font-display text-3xl text-locker-leather tabular-nums">
                  {totalPredictedPoints.toFixed(1)}
                </div>
              </StatTile>
              <StatTile label="Salary used">
                <div
                  className={`mt-1 font-display text-3xl tabular-nums ${isOverBudget ? "text-locker-bad" : "text-landing-ink"}`}
                >
                  {formatSalary(totalSalary)}
                </div>
                <div
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={effectiveBudget}
                  aria-valuenow={totalSalary}
                  aria-label="Salary used against the budget cap"
                  className="mt-3 h-1.5 w-full overflow-hidden bg-landing-hero"
                >
                  <div
                    className={`h-full ${isOverBudget ? "bg-locker-bad" : "bg-locker-leather"}`}
                    style={{ width: `${Math.min(percentOfCapUsed, 100)}%` }}
                  />
                </div>
                <p
                  className={`mt-1.5 font-mono text-[9.5px] tracking-[0.08em] uppercase ${isOverBudget ? "text-locker-bad" : "text-locker-ink-muted"}`}
                >
                  {percentOfCapUsed}% of cap ·{" "}
                  {isOverBudget
                    ? `${formatSalary(salaryHeadroomInDollars)} OVER the cap`
                    : `${formatSalary(salaryHeadroomInDollars)} under the cap`}
                </p>
              </StatTile>
              <StatTile label="Budget cap">
                {isEditingLineup ? (
                  <input
                    aria-label="Edit budget cap"
                    type="number"
                    min={0}
                    step={500}
                    value={effectiveBudget}
                    onChange={(event) => {
                      setBudgetOverride(Number(event.target.value));
                      saveMutation.reset();
                    }}
                    className="mt-1 w-full border border-landing-light bg-landing-hero px-2 py-1 font-display text-2xl text-landing-ink tabular-nums focus:border-locker-leather focus:outline-none"
                  />
                ) : (
                  <div className="mt-1 font-display text-3xl text-landing-ink tabular-nums">
                    {formatSalary(effectiveBudget)}
                  </div>
                )}
                <p className="mt-1.5 font-mono text-[9.5px] tracking-[0.08em] text-locker-ink-muted uppercase">
                  {isEditingLineup ? "Editable while editing" : "Edit the lineup to change it"}
                </p>
              </StatTile>
            </div>
          </section>
        </Reveal>

        <Reveal replay={false} delay={2}>
          <section className="mb-6">
            <div className="mb-3 flex flex-wrap items-center gap-3.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-locker-leather">03</span>
              <h2 className={MODULE_HEADING_CLASS}>The lineup</h2>
              <span aria-hidden className={MODULE_RULE_CLASS} />
              <div className="flex items-center gap-2.5">
                {hasLineupEdits && (
                  <button
                    type="button"
                    onClick={resetLineupEdits}
                    className="font-mono text-[10.5px] tracking-[0.14em] text-locker-ink-muted uppercase transition-colors hover:text-landing-ink"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingLineup((previous) => !previous)}
                  className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
                >
                  {isEditingLineup ? "Done editing" : "Edit lineup"}
                </button>
              </div>
            </div>
            <p className="mb-3 max-w-2xl text-[12.5px] text-locker-ink-muted">
              Dollars per point is derived here, not stored — it is what makes a cheap high-floor player visibly
              better value than an expensive star.
            </p>

            {isEditingLineup && slots.length < LINEUP_SIZE && (
              <div className="mb-4 border border-landing-light bg-locker-surface p-4">
                <p className="font-mono text-[10px] tracking-[0.14em] text-locker-leather uppercase">
                  Suggested adds
                </p>
                <p className="mt-1 text-[11.5px] text-locker-ink-muted">
                  Best dollars-per-point that still fit under the cap — click to add one to the board.
                </p>
                {suggestionsQuery.isPending ? (
                  <p className="mt-3 text-[12px] text-locker-ink-muted">Loading suggestions…</p>
                ) : suggestedAdds.length === 0 ? (
                  <p className="mt-3 text-[12px] text-locker-ink-muted">
                    {remainingBudgetInDollars < 0
                      ? "Nothing fits while the board is over the cap — raise the budget or swap a player out first."
                      : "No predicted players fit the remaining budget."}
                  </p>
                ) : (
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {suggestedAdds.map((item) => (
                      <li
                        key={item.playerId}
                        className="flex items-center gap-2.5 border border-landing-light bg-landing-hero p-2.5"
                      >
                        <PlayerHeadshot player={item.player} size="sm" alt="" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-[12px] text-landing-ink uppercase">
                            {item.player.firstName} {item.player.lastName}
                          </p>
                          <p className="truncate font-mono text-[9.5px] tracking-[0.08em] text-locker-ink-muted uppercase">
                            {item.predictedFantasyPoints.toFixed(1)} pts · {formatSalary(item.salary)} · $
                            {Math.round(item.salary / item.predictedFantasyPoints).toLocaleString("en-US")}/pt
                            {fillsPositionNeed(item) && (
                              <span className="text-locker-leather">
                                {" "}
                                · fills your {needsGuard && item.player.position.includes("G") ? "guard" : "forward"} slot
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Add ${item.player.firstName} ${item.player.lastName} to the lineup`}
                          onClick={() => void addPlayer(item.player, item)}
                          className="shrink-0 border border-landing-light bg-locker-surface px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isEditingLineup && slots.length < LINEUP_SIZE && (
              <div className="mb-4 max-w-sm">
                <PlayerSearchCombobox
                  onSelect={(player) => void addPlayer(player)}
                  excludedPlayerIds={excludedPlayerIds}
                  placeholder="Search a player to add"
                  label="Add a player to the lineup"
                  variant="locker"
                />
              </div>
            )}

            <div className="overflow-x-auto border border-landing-light bg-locker-surface">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-landing-light bg-landing-hero">
                    <th className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Player</th>
                    <th className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Team</th>
                    <th className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Pos</th>
                    <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Proj pts</th>
                    <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Salary</th>
                    <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">$ / PT</th>
                    {isEditingLineup && <th className="px-3 py-2.5"><span className="sr-only">Remove</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.id} className="border-b border-landing-light transition-colors last:border-b-0 hover:bg-landing-hero">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <PlayerHeadshot player={slot.player} size="sm" alt="" />
                          <Link
                            to={`/players/${slot.player.id}`}
                            className="font-display text-[12.5px] text-landing-ink uppercase transition-colors hover:text-locker-leather"
                          >
                            {slot.player.firstName} {slot.player.lastName}
                          </Link>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {slot.player.team ? (
                          <span className="flex items-center gap-2 text-[12px] text-landing-ink">
                            <TeamBadge team={slot.player.team} size="sm" />
                            {slot.player.team.abbreviation}
                          </span>
                        ) : (
                          <span className="text-[12px] text-locker-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-landing-ink">{slot.player.position}</td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] text-landing-ink tabular-nums">
                        {formatPoints(slot.predictedFantasyPoints)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] text-landing-ink tabular-nums">
                        {formatSalary(slot.salary)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] text-landing-ink tabular-nums">
                        {formatDollarsPerPoint(slot)}
                      </td>
                      {isEditingLineup && (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            aria-label={`Remove ${slot.player.firstName} ${slot.player.lastName} from the lineup`}
                            className="border border-landing-light px-1.5 py-0.5 font-mono text-[10px] text-locker-ink-muted transition-colors hover:border-locker-bad hover:text-locker-bad"
                            onClick={() => removeSlot(slot.id)}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </Reveal>

        <Reveal replay={false} delay={3}>
          <section className="border border-landing-light bg-locker-surface p-6">
            <div className="mb-4 flex items-center gap-3.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-locker-leather">04</span>
              <h2 className={MODULE_HEADING_CLASS}>Solver checks</h2>
              <span aria-hidden className={MODULE_RULE_CLASS} />
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {constraints.map((constraint) => (
                <ConstraintRow
                  key={constraint.key}
                  label={constraint.label}
                  detail={constraint.detail}
                  met={constraint.met}
                />
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-landing-light pt-4">
              <p className="min-w-52 flex-1 text-[12.5px] text-locker-ink-muted">{footerMessage}</p>
              <div className="flex items-center gap-3">
                {saveMutation.isSuccess && (
                  <p className="font-mono text-[10.5px] tracking-[0.08em] text-locker-good uppercase">
                    Saved —{" "}
                    <Link to="/profile" className="underline hover:text-landing-ink">
                      view it on your profile
                    </Link>
                  </p>
                )}
                {saveMutation.isError && (
                  <p className="font-mono text-[10.5px] tracking-[0.08em] text-locker-bad uppercase">
                    {saveMutation.error instanceof ApiError ? saveMutation.error.message : "Couldn't save the lineup."}
                  </p>
                )}
                <button
                  ref={saveButtonRef}
                  type="button"
                  onClick={() => setIsNamePromptOpen(true)}
                  disabled={!canSave}
                  className="border border-landing-light bg-landing-ink px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-hero uppercase transition-colors hover:bg-locker-leather disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving…" : "Save lineup"}
                </button>
              </div>
            </div>
          </section>
        </Reveal>

        {isNamePromptOpen && (
          <SaveLineupDialog
            name={lineupName}
            isPending={saveMutation.isPending}
            errorMessage={
              saveMutation.isError
                ? saveMutation.error instanceof ApiError
                  ? saveMutation.error.message
                  : "Couldn't save the lineup."
                : null
            }
            onNameChange={setLineupName}
            onCancel={closeNamePrompt}
            onSubmit={handleSaveLineup}
          />
        )}
      </div>
    </div>
  );
}
