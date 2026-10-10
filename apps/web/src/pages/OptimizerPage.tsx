import { useEffect, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchLatestLineup, fetchPlayerPrediction, fetchPlayerPredictions, solveLineup } from "@/lib/nbaApi";
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
import { PageTutorial } from "@/components/tutorial/PageTutorial";
import { OPTIMIZER_TUTORIAL } from "@/components/tutorial/definitions/optimizerTutorial";
import type {
  LineupSlot,
  Player,
  PlayerPredictionListItem,
  PlayerPredictionSummary,
  SolvedLineup,
} from "@/types/nba";

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

// How many times a solve that failed on the server's side (a 5xx or a
// network error) is retried before the page says so and offers Try again.
const SOLVE_RETRIES_ON_SERVER_ERROR = 1;

// Runner-up lineups listed under the best one. The API allows up to 4; three
// is enough to compare without turning the page into a list of lineups.
const ALTERNATIVE_LINEUP_COUNT = 3;

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

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

// A solved lineup in the board's own slot shape, so the totals, the table,
// the solver checks and saving all work on it unchanged. Solved lineups
// aren't stored, so each slot is keyed by its player.
function toBoardSlots(lineup: SolvedLineup): LineupSlot[] {
  return lineup.slots.map((slot) => ({
    id: slot.playerId,
    lineupId: `solved-${lineup.rank}`,
    playerId: slot.playerId,
    player: slot.player,
    predictedFantasyPoints: slot.predictedFantasyPoints,
    salary: slot.salary,
  }));
}

// The solver's own words for why no lineup fits the rules: the API answers
// 400 INFEASIBLE_LINEUP with a message naming the rule to change ("You
// locked 6 players, but a lineup has only 5 slots..."). Null for any other
// failure — a server or network error, which trying again may fix.
function describeSolveFailure(error: unknown): string | null {
  return error instanceof ApiError && error.status === 400 ? error.message : null;
}

// The same five players in any order give the same key, so a solved lineup
// can be matched against the one on the board.
function playerSetKey(playerIds: string[]): string {
  return [...playerIds].sort().join(",");
}

// How an alternative's projection compares with the best lineup's, in words.
// Within a rounding step counts as level, since both show to one decimal.
function describePointsGap(gap: number): string {
  if (Math.abs(gap) < 0.05) return "level with the best";
  return gap < 0
    ? `${formatPoints(-gap)} fewer than the best`
    : `${formatPoints(gap)} more than the best`;
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
      <div className="min-w-0">
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

// One side of the rules panel: the players under that rule, each with a
// button to drop it, and a search to add another. Dropping a rule removes
// its button, so focus moves to this side's search box rather than falling
// back to the page body.
function RuleColumn({
  title,
  players,
  emptyText,
  removeLabel,
  onRemove,
  onAdd,
  searchLabel,
  searchPlaceholder,
  ruledPlayerIds,
}: {
  title: string;
  players: Player[];
  emptyText: string;
  removeLabel: (name: string) => string;
  onRemove: (playerId: string) => void;
  onAdd: (player: Player) => void;
  searchLabel: string;
  searchPlaceholder: string;
  ruledPlayerIds: string[];
}) {
  const columnRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={columnRef} className="border border-landing-light bg-landing-hero p-3">
      <h3 className="font-mono text-[10px] tracking-[0.14em] text-locker-leather uppercase">{title}</h3>
      {players.length === 0 ? (
        <p className="mt-2 text-[12px] text-locker-ink-muted">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {players.map((player) => (
            <li
              key={player.id}
              className="inline-flex items-center gap-1.5 border border-landing-light bg-locker-surface py-0.5 pr-0.5 pl-2 font-display text-[11.5px] text-landing-ink uppercase"
            >
              {playerName(player)}
              <button
                type="button"
                aria-label={removeLabel(playerName(player))}
                onClick={() => {
                  columnRef.current?.querySelector("input")?.focus();
                  onRemove(player.id);
                }}
                className="inline-flex size-7 items-center justify-center font-mono text-[10px] text-locker-ink-muted transition-colors hover:text-locker-bad"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <PlayerSearchCombobox
          onSelect={onAdd}
          excludedPlayerIds={ruledPlayerIds}
          placeholder={searchPlaceholder}
          label={searchLabel}
          variant="locker"
        />
      </div>
    </div>
  );
}

// "Your rules": the players the solver must include and the ones it must
// leave out. Any rule at all switches the page from the precomputed lineup
// to one solved on demand (POST /v1/optimizer/solve) under those rules.
function LineupRulesPanel({
  lockedPlayers,
  excludedPlayers,
  status,
  onLock,
  onUnlock,
  onExclude,
  onUnexclude,
  onClear,
}: {
  lockedPlayers: Player[];
  excludedPlayers: Player[];
  status: string;
  onLock: (player: Player) => void;
  onUnlock: (playerId: string) => void;
  onExclude: (player: Player) => void;
  onUnexclude: (playerId: string) => void;
  onClear: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const hasRules = lockedPlayers.length > 0 || excludedPlayers.length > 0;
  // A player can be under one rule at most, so neither search offers anyone
  // already under either.
  const ruledPlayerIds = [...lockedPlayers, ...excludedPlayers].map((player) => player.id);

  return (
    <section ref={panelRef} className="mb-6 border border-landing-light bg-locker-surface p-4 sm:p-6">
      <SectionHeading eyebrow="02" title="Your rules" />
      <p className="-mt-1 mb-4 max-w-2xl text-[12.5px] leading-relaxed text-locker-ink-muted">
        Tell the solver who must be in the lineup and who to leave out, and it finds the best lineup that follows
        your rules. Use the buttons on each row of the lineup, or search for any player here. Changing a rule
        solves the lineup again and replaces any edits on the board.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RuleColumn
          title="Must include"
          players={lockedPlayers}
          emptyText="No one yet. Every lineup will include the players you add here."
          removeLabel={(name) => `Stop requiring ${name}`}
          onRemove={onUnlock}
          onAdd={onLock}
          searchLabel="Search for a player the lineup must include"
          searchPlaceholder="Add a must-include player"
          ruledPlayerIds={ruledPlayerIds}
        />
        <RuleColumn
          title="Excluded"
          players={excludedPlayers}
          emptyText="No one yet. No lineup will include the players you add here."
          removeLabel={(name) => `Allow ${name} again`}
          onRemove={onUnexclude}
          onAdd={onExclude}
          searchLabel="Search for a player to leave out of the lineup"
          searchPlaceholder="Add a player to exclude"
          ruledPlayerIds={ruledPlayerIds}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-landing-light pt-4">
        <p role="status" className="min-w-52 flex-1 text-[12.5px] text-locker-ink-muted">
          {status}
        </p>
        {hasRules && (
          <button
            type="button"
            onClick={() => {
              // The button goes away with the rules; keep focus in the panel.
              panelRef.current?.querySelector("input")?.focus();
              onClear();
            }}
            className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
          >
            Clear all rules
          </button>
        )}
      </div>
    </section>
  );
}

// Stands in for the totals, the board and the checks when a solve under the
// user's rules fails: showing the precomputed lineup instead would quietly
// ignore the rules. The rules panel above stays, so the fix is one click up.
function SolveFailureNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const reason = describeSolveFailure(error);
  return (
    <section className="mb-6 border border-landing-light bg-locker-surface p-4 sm:p-6">
      <h2 className="font-display text-sm tracking-[0.14em] text-landing-ink uppercase">
        {reason ? "No lineup fits your rules" : "Couldn't solve with your rules"}
      </h2>
      <p role="alert" className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-landing-ink">
        {reason ?? "Something went wrong on our side while solving. Your rules are kept, so try again."}
      </p>
      {reason ? (
        <p className="mt-2 max-w-2xl text-[12px] text-locker-ink-muted">
          Change a rule above, or clear them all to go back to the solver's own lineup.
        </p>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
        >
          Try again
        </button>
      )}
    </section>
  );
}

// One alternative's swap list: who leaves the best lineup and who comes in.
function SwapLine({ label, players }: { label: string; players: Player[] }) {
  return (
    <div className="flex gap-2">
      <dt className="w-7 shrink-0 font-mono text-[9.5px] leading-[18px] tracking-[0.1em] text-locker-ink-muted uppercase">
        {label}
      </dt>
      <dd className="text-[12px] leading-[18px] text-landing-ink">{players.map(playerName).join(", ")}</dd>
    </div>
  );
}

// "Alternative lineups": the next best lineups under the same rules as the
// best one, each summed up by its projection, its salary and the players it
// swaps. Compared with the best lineup as solved, not with any edits made to
// the board since.
function AlternativeLineups({
  alternatives,
  bestSlots,
  bestTotalPoints,
  isUpdating,
  isError,
  onRetry,
}: {
  alternatives: SolvedLineup[] | undefined;
  bestSlots: LineupSlot[];
  bestTotalPoints: number;
  isUpdating: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const bestIds = new Set(bestSlots.map((slot) => slot.player.id));

  let body: ReactNode;
  if (alternatives === undefined && isError && !isUpdating) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[12.5px] text-locker-ink-muted">Couldn't load the alternative lineups.</p>
        <button
          type="button"
          onClick={onRetry}
          className="border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather"
        >
          Try again
        </button>
      </div>
    );
  } else if (alternatives === undefined) {
    body = <p className="text-[12.5px] text-locker-ink-muted">Finding the next best lineups…</p>;
  } else if (alternatives.length === 0) {
    body = <p className="text-[12.5px] text-locker-ink-muted">No other lineup fits the same rules.</p>;
  } else {
    body = (
      <ol className={`grid grid-cols-1 gap-2 transition-opacity md:grid-cols-3 ${isUpdating ? "opacity-60" : ""}`}>
        {alternatives.map((lineup, index) => {
          const ids = new Set(lineup.slots.map((slot) => slot.playerId));
          const playersOut = bestSlots.filter((slot) => !ids.has(slot.player.id)).map((slot) => slot.player);
          const playersIn = lineup.slots.filter((slot) => !bestIds.has(slot.playerId)).map((slot) => slot.player);
          return (
            <li key={playerSetKey([...ids])} className="border border-landing-light bg-landing-hero p-3">
              <h3 className="font-mono text-[10px] tracking-[0.14em] text-locker-leather uppercase">
                Alternative {index + 1}
              </h3>
              <p className="mt-1 text-[12.5px] text-landing-ink tabular-nums">
                {formatPoints(lineup.totalPredictedPoints)} projected pts · {formatSalary(lineup.totalSalary)}
              </p>
              <p className="text-[12px] text-locker-ink-muted">
                {describePointsGap(lineup.totalPredictedPoints - bestTotalPoints)}
              </p>
              <dl className="mt-2 space-y-0.5">
                <SwapLine label="Out" players={playersOut} />
                <SwapLine label="In" players={playersIn} />
              </dl>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section
      aria-labelledby="alternative-lineups-heading"
      aria-busy={isUpdating}
      className="mt-6 border border-landing-light bg-locker-surface p-4 sm:p-6"
    >
      <div className="mb-3 flex items-center gap-3.5">
        <span className="font-mono text-[10px] tracking-[0.2em] text-locker-leather">06</span>
        <h2 id="alternative-lineups-heading" className={MODULE_HEADING_CLASS}>
          Alternative lineups
        </h2>
        <span aria-hidden className={MODULE_RULE_CLASS} />
      </div>
      <p className="mb-3 max-w-2xl text-[12.5px] text-locker-ink-muted">
        The next best lineups under the same rules, each a different set of players, with the players it swaps
        compared with the best lineup above.
      </p>
      {body}
    </section>
  );
}

function PageHeader({
  solvedAt,
  budget,
  solvedWithYourRules = false,
}: {
  solvedAt?: string;
  budget?: number;
  solvedWithYourRules?: boolean;
}) {
  return (
    <header className="mb-6 border border-landing-light bg-locker-surface p-4 sm:p-6">
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
          {solvedWithYourRules ? "Solved with your rules" : `Solved ${formatTimeAgo(solvedAt)}`}
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
  const lineupHeadingRef = useRef<HTMLHeadingElement>(null);

  // The user's rules for the solver: players every lineup must include, and
  // players none may. Kept as whole players, not ids, so the rules panel can
  // name them without a lookup. A player is under one rule at most.
  const [lockedPlayers, setLockedPlayers] = useState<Player[]>([]);
  const [excludedPlayers, setExcludedPlayers] = useState<Player[]>([]);
  const lockedIds = lockedPlayers.map((player) => player.id);
  const excludedIds = excludedPlayers.map((player) => player.id);
  const hasRules = lockedIds.length > 0 || excludedIds.length > 0;

  // The solver, run on demand under the user's rules, which may be none:
  // it always answers with runners-up for the Alternative lineups section.
  // With no rules the board keeps the precomputed lineup above; any rule
  // puts the solved best lineup on the board instead. The previous answer
  // stays on screen while the next one loads, so the board doesn't blank out
  // on every click. An infeasible rule set (a 4xx) says the same thing
  // however often it's retried, so only server and network errors are, and
  // only once: the user can always retry by hand from the error.
  const solveQuery = useQuery({
    queryKey: ["optimizerSolve", data?.budget, [...lockedIds].sort(), [...excludedIds].sort(), ALTERNATIVE_LINEUP_COUNT],
    queryFn: () =>
      solveLineup({
        budget: data!.budget,
        lockedPlayerIds: lockedIds,
        excludedPlayerIds: excludedIds,
        alternatives: ALTERNATIVE_LINEUP_COUNT,
      }),
    enabled: data !== undefined,
    placeholderData: keepPreviousData,
    retry: (failureCount, solveError) =>
      !(solveError instanceof ApiError && solveError.status < 500) && failureCount < SOLVE_RETRIES_ON_SERVER_ERROR,
  });
  const solved = solveQuery.data;
  // Only an answer solved under some rule may stand in for the precomputed
  // lineup. While the first rule's solve loads, the answer on hand is the
  // no-rules one, which isn't "solved with your rules".
  const solvedUnderRules = solved !== undefined && solved.lockedPlayerIds.length + solved.excludedPlayerIds.length > 0;
  const solvedBest = hasRules && solvedUnderRules ? solved.lineups[0] : undefined;
  // What the board starts from before any local edit: the lineup solved
  // under the rules once there is one, else the precomputed lineup.
  const baseSlots = solvedBest ? toBoardSlots(solvedBest) : (data?.slots ?? []);
  const boardKey = solvedBest ? `solved:${baseSlots.map((slot) => slot.playerId).join(",")}` : data?.id;
  // The runners-up: every solved lineup except the best one on the board.
  // With no rules, that drops the solver's own copy of the precomputed lineup.
  const bestPlayerSetKey = playerSetKey(baseSlots.map((slot) => slot.player.id));
  const alternativeLineups = solved?.lineups
    .filter((lineup) => playerSetKey(lineup.slots.map((slot) => slot.playerId)) !== bestPlayerSetKey)
    .slice(0, ALTERNATIVE_LINEUP_COUNT);

  useEffect(() => {
    setIsEditingLineup(false);
    setEditedSlots(null);
    setBudgetOverride(null);
    setLineupName("");
    setIsNamePromptOpen(false);
  }, [boardKey]);

  function lockPlayer(player: Player) {
    setExcludedPlayers((previous) => previous.filter((excluded) => excluded.id !== player.id));
    setLockedPlayers((previous) => (previous.some((locked) => locked.id === player.id) ? previous : [...previous, player]));
  }

  function unlockPlayer(playerId: string) {
    setLockedPlayers((previous) => previous.filter((locked) => locked.id !== playerId));
  }

  function excludePlayer(player: Player) {
    setLockedPlayers((previous) => previous.filter((locked) => locked.id !== player.id));
    setExcludedPlayers((previous) =>
      previous.some((excluded) => excluded.id === player.id) ? previous : [...previous, player]
    );
  }

  function unexcludePlayer(playerId: string) {
    setExcludedPlayers((previous) => previous.filter((excluded) => excluded.id !== playerId));
  }

  function clearRules() {
    setLockedPlayers([]);
    setExcludedPlayers([]);
  }

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
  const currentSlotCount = (editedSlots ?? baseSlots).length;
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
    setEditedSlots((previous) => (previous ?? baseSlots).filter((slot) => slot.id !== slotId));
    saveMutation.reset();
  }

  // An optional pre-known prediction lets the suggestion panel add a player
  // without a second lookup; the combobox path doesn't have one, so it
  // fetches the player's latest numbers the same way it always did.
  async function addPlayer(player: Player, prediction?: PlayerPredictionSummary) {
    const latest = prediction ?? (await fetchPlayerPrediction(player.id));
    setEditedSlots((previous) => [
      ...(previous ?? baseSlots),
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
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
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
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
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

  const slots = editedSlots ?? baseSlots;
  const hasLineupEdits = editedSlots !== null || budgetOverride !== null;
  const totalPredictedPoints = editedSlots !== null
    ? slots.reduce((sum, slot) => sum + (slot.predictedFantasyPoints ?? 0), 0)
    : (solvedBest?.totalPredictedPoints ?? data.totalPredictedPoints);
  const totalSalary = editedSlots !== null
    ? slots.reduce((sum, slot) => sum + (slot.salary ?? 0), 0)
    : (solvedBest?.totalSalary ?? data.totalSalary);
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

  const isSolving = hasRules && solveQuery.isFetching;
  const solveFailed = hasRules && solveQuery.isError && !isSolving;
  let rulesStatus: string;
  if (!hasRules) {
    rulesStatus = "No rules set, so the lineup below is the solver's own pick.";
  } else if (isSolving) {
    rulesStatus = "Solving with your rules…";
  } else if (solveFailed) {
    rulesStatus = "No lineup to show yet. The note below says why.";
  } else {
    rulesStatus = "The lineup below is the best one that follows your rules.";
  }

  // The header and the rules panel open the page whether or not the rules
  // could be solved. Both branches below place them first, so React keeps
  // the panel (and whatever is typed in its searches) across the switch.
  const pageHeader = (
    <Reveal replay={false}>
      <PageHeader solvedAt={data.createdAt} budget={data.budget} solvedWithYourRules={solvedBest !== undefined} />
    </Reveal>
  );
  const rulesPanel = (
    <Reveal replay={false} delay={1}>
      <LineupRulesPanel
        lockedPlayers={lockedPlayers}
        excludedPlayers={excludedPlayers}
        status={rulesStatus}
        onLock={lockPlayer}
        onUnlock={unlockPlayer}
        onExclude={excludePlayer}
        onUnexclude={unexcludePlayer}
        onClear={clearRules}
      />
    </Reveal>
  );

  if (solveFailed) {
    return (
      <div className="min-h-full bg-landing-hero">
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
          {pageHeader}
          {rulesPanel}
          <Reveal replay={false} delay={2}>
            <SolveFailureNotice error={solveQuery.error} onRetry={() => void solveQuery.refetch()} />
          </Reveal>
        </div>
        <PageTutorial tutorial={OPTIMIZER_TUTORIAL} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
        {pageHeader}
        {rulesPanel}

        <Reveal replay={false} delay={2}>
          <section className="mb-6">
            <SectionHeading eyebrow="03" title="Lineup totals" />
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

        <Reveal replay={false} delay={3}>
          <section className="mb-6">
            <div className="mb-3 flex flex-wrap items-center gap-3.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-locker-leather">04</span>
              {/* Focusable so excluding a row's player (which removes the row
                  and its button) can hand focus somewhere sensible. */}
              <h2 ref={lineupHeadingRef} tabIndex={-1} className={MODULE_HEADING_CLASS}>
                The lineup
              </h2>
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

            <div
              className={`overflow-x-auto border border-landing-light bg-locker-surface transition-opacity ${
                isSolving ? "opacity-60" : ""
              }`}
            >
              <table className="w-full text-left" aria-busy={isSolving}>
                <thead>
                  <tr className="border-b border-landing-light bg-landing-hero">
                    <th className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Player</th>
                    <th className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Team</th>
                    <th className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase hidden md:table-cell">Pos</th>
                    <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Proj pts</th>
                    <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Salary</th>
                    <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase hidden sm:table-cell">$ / PT</th>
                    {isEditingLineup ? (
                      <th className="px-3 py-2.5"><span className="sr-only">Remove</span></th>
                    ) : (
                      <th className="px-3 py-2.5 text-right font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">Rules</th>
                    )}
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
                      <td className="hidden px-3 py-2.5 text-[12px] text-landing-ink md:table-cell">
                        {slot.player.position}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] text-landing-ink tabular-nums">
                        {formatPoints(slot.predictedFantasyPoints)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] text-landing-ink tabular-nums">
                        {formatSalary(slot.salary)}
                      </td>
                      <td className="hidden px-3 py-2.5 text-right text-[12.5px] text-landing-ink tabular-nums sm:table-cell">
                        {formatDollarsPerPoint(slot)}
                      </td>
                      {isEditingLineup ? (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            aria-label={`Remove ${slot.player.firstName} ${slot.player.lastName} from the lineup`}
                            className="inline-flex size-9 items-center justify-center border border-landing-light font-mono text-[10px] text-locker-ink-muted transition-colors hover:border-locker-bad hover:text-locker-bad sm:size-auto sm:px-1.5 sm:py-0.5"
                            onClick={() => removeSlot(slot.id)}
                          >
                            ✕
                          </button>
                        </td>
                      ) : (
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex gap-1.5">
                            <button
                              type="button"
                              aria-pressed={lockedIds.includes(slot.player.id)}
                              aria-label={`Must include ${playerName(slot.player)}`}
                              onClick={() =>
                                lockedIds.includes(slot.player.id) ? unlockPlayer(slot.player.id) : lockPlayer(slot.player)
                              }
                              className="border border-landing-light px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] text-locker-ink-muted uppercase transition-colors hover:border-locker-leather hover:text-landing-ink aria-pressed:border-locker-leather aria-pressed:bg-locker-leather aria-pressed:text-landing-hero"
                            >
                              Must include
                            </button>
                            <button
                              type="button"
                              aria-label={`Exclude ${playerName(slot.player)}`}
                              onClick={() => {
                                lineupHeadingRef.current?.focus();
                                excludePlayer(slot.player);
                              }}
                              className="border border-landing-light px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] text-locker-ink-muted uppercase transition-colors hover:border-locker-bad hover:text-locker-bad"
                            >
                              Exclude
                            </button>
                          </span>
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
          <section className="border border-landing-light bg-locker-surface p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-3.5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-locker-leather">05</span>
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

        <Reveal replay={false} delay={3}>
          <AlternativeLineups
            alternatives={alternativeLineups}
            bestSlots={baseSlots}
            bestTotalPoints={solvedBest?.totalPredictedPoints ?? data.totalPredictedPoints}
            isUpdating={solveQuery.isFetching}
            isError={solveQuery.isError}
            onRetry={() => void solveQuery.refetch()}
          />
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

      {/* The page tutorial: opens by itself on this account's first visit,
          and the "?" button replays it. Only on this, the loaded branch — the
          tutorial walks through the totals, the table and the solver checks,
          none of which the no-lineup, error or loading branches above
          render. Kept outside every Reveal — their rise animation is a
          transform, which would pin the tutorial's fixed overlay and button
          to that block instead of the viewport. */}
      <PageTutorial tutorial={OPTIMIZER_TUTORIAL} />
    </div>
  );
}
