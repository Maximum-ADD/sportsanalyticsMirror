import { useRef, useState } from "react";
import {
  findBoxScoreIssues,
  hasBlockingIssue,
  issueForField,
} from "@/lib/boxScoreValidation";
import type { ProspectGameInput } from "@/types/nba";

interface GameEntryRowProps {
  onSave: (game: ProspectGameInput) => Promise<unknown>;
  isSaving: boolean;
  /** The last game saved, for the "same again" prefills. */
  lastGame?: ProspectGameInput;
  /** Surfaced verbatim from the API's error envelope when a save fails. */
  errorMessage?: string | null;
}

const EMPTY_GAME: ProspectGameInput = {
  gameDate: "",
  opponent: "",
  minutes: 0,
  points: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  threesMade: 0,
  threesAttempted: 0,
  freeThrowsMade: 0,
  freeThrowsAttempted: 0,
};

// Ordered the way a scoresheet reads across, so entering a row is a straight
// left-to-right pass rather than hunting for the next field.
const NUMBER_FIELDS: { field: keyof ProspectGameInput; label: string }[] = [
  { field: "minutes", label: "MIN" },
  { field: "points", label: "PTS" },
  { field: "rebounds", label: "REB" },
  { field: "assists", label: "AST" },
  { field: "steals", label: "STL" },
  { field: "blocks", label: "BLK" },
  { field: "turnovers", label: "TOV" },
  { field: "fieldGoalsMade", label: "FGM" },
  { field: "fieldGoalsAttempted", label: "FGA" },
  { field: "threesMade", label: "3PM" },
  { field: "threesAttempted", label: "3PA" },
  { field: "freeThrowsMade", label: "FTM" },
  { field: "freeThrowsAttempted", label: "FTA" },
];

/**
 * One game, entered by hand.
 *
 * This is the only genuinely new surface in the feature, and it is built
 * around the fact that somebody back-filling a season enters twenty of these
 * in one sitting. So: Enter submits from any field, focus returns to a blank
 * row with the date carried forward, and "Same opponent" refills the fixture
 * details from the row just saved. A generic form would be correct and nobody
 * would finish a season with it.
 *
 * Validation splits blocking from advisory (see lib/boxScoreValidation.ts).
 * Arithmetic that cannot be true stops the save; a points total that merely
 * disagrees with its own shooting splits is flagged and still saveable,
 * because real scoresheets do that and refusing the user's own sheet is worse.
 */
export function GameEntryRow({ onSave, isSaving, lastGame, errorMessage }: GameEntryRowProps) {
  const [draft, setDraft] = useState<ProspectGameInput>(EMPTY_GAME);
  // Issues are held back until a save is attempted, so the row does not shout
  // at somebody who has simply not finished typing it yet.
  const [showIssues, setShowIssues] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const issues = findBoxScoreIssues(draft);
  const isBlocked = hasBlockingIssue(issues);

  function set<K extends keyof ProspectGameInput>(field: K, value: ProspectGameInput[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit() {
    setShowIssues(true);
    if (isBlocked || isSaving) return;

    try {
      await onSave(draft);
    } catch {
      // The caller surfaces the failure through `errorMessage`; swallowing it
      // here keeps the rejection from escaping as an unhandled promise. The
      // draft is deliberately left intact — a rejected save must not cost
      // somebody the row they just typed.
      return;
    }

    // Carry the date forward: the next game is far more often in the same week
    // than on no date at all, and re-typing it twenty times is the single
    // biggest cost of logging a season.
    setDraft({ ...EMPTY_GAME, gameDate: draft.gameDate });
    setShowIssues(false);
    firstFieldRef.current?.focus();
  }

  function fieldError(field: keyof ProspectGameInput) {
    if (!showIssues) return undefined;
    return issueForField(issues, field);
  }

  return (
    <form
      aria-label="Add a game"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      className="border border-landing-light bg-landing-hero p-3"
    >
      <div className="flex flex-wrap items-end gap-2.5">
        <TextField
          id="game-date"
          label="Date"
          type="date"
          value={draft.gameDate}
          onChange={(value) => set("gameDate", value)}
          inputRef={firstFieldRef}
          issue={fieldError("gameDate")}
        />
        <TextField
          id="game-opponent"
          label="Opponent"
          type="text"
          value={draft.opponent}
          onChange={(value) => set("opponent", value)}
          issue={fieldError("opponent")}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {NUMBER_FIELDS.map(({ field, label }) => (
          <NumberField
            key={field}
            id={`game-${field}`}
            label={label}
            value={draft[field] as number}
            onChange={(value) => set(field, value as never)}
            issue={fieldError(field)}
          />
        ))}
      </div>

      {/* Blocking issues first: they are why the button is disabled. */}
      {showIssues && issues.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {issues.map((issue) => (
            <li
              key={issue.code}
              className={`text-[11.5px] ${
                issue.severity === "blocking" ? "text-locker-bad" : "text-locker-ink-muted"
              }`}
            >
              {/* The word, not just the colour — "check" versus a hard stop
                  has to be legible in greyscale. */}
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase">
                {issue.severity === "blocking" ? "Fix" : "Check"}
              </span>{" "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {errorMessage && (
        <p role="alert" className="mt-2.5 text-[11.5px] text-locker-bad">
          {errorMessage}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isSaving || (showIssues && isBlocked)}
          className="min-h-11 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          {isSaving ? "Saving…" : "Add game"}
        </button>
        {lastGame && (
          <button
            type="button"
            onClick={() => setDraft({ ...lastGame, gameDate: draft.gameDate || lastGame.gameDate })}
            className="min-h-11 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-locker-ink-muted uppercase transition-colors hover:border-locker-leather hover:text-landing-ink sm:min-h-0"
          >
            Copy last game
          </button>
        )}
      </div>
    </form>
  );
}

const LABEL_CLASS = "font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase";
const INPUT_CLASS =
  "border bg-locker-surface px-2 py-1.5 text-[13px] text-landing-ink focus:border-locker-leather focus:outline-none";

function TextField({
  id,
  label,
  type,
  value,
  onChange,
  inputRef,
  issue,
}: {
  id: string;
  label: string;
  type: "date" | "text";
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  issue?: { message: string };
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={issue ? true : undefined}
        className={`${INPUT_CLASS} ${issue ? "border-locker-bad" : "border-landing-light"} w-40`}
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  issue,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  issue?: { message: string };
}) {
  return (
    <div className="flex w-[4.25rem] flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        // A phone keypad rather than a full keyboard: thirteen numeric fields
        // per game makes this the difference between usable and not.
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-invalid={issue ? true : undefined}
        className={`${INPUT_CLASS} ${issue ? "border-locker-bad" : "border-landing-light"} w-full tabular-nums`}
      />
    </div>
  );
}
