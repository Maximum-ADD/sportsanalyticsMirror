import { type FormEvent, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  correctGameEvent,
  previewEventCorrection,
  type AdminGameEvent,
  type AdminGamePlayByPlay,
  type CorrectionOutcome,
  type CorrectionRequestBody,
  type SavedCorrection,
} from "@/lib/adminApi";
import { BUTTON_CLASS, INPUT_CLASS, LABEL_CLASS, PANEL_CLASS, SECTION_HEADING_CLASS, TABLE_HEADER_CELL_CLASS } from "./adminStyles";
import {
  formatCorrectionValue,
  formatFieldLabel,
  formatStatLabel,
  formatStatValue,
  type CorrectionNameLookup,
} from "./correctionFormatting";
import {
  buildCorrectionBody,
  createPlayForm,
  creditCandidates,
  dropInvalidCredit,
  creditStatFor,
  CREDIT_LABELS,
  formatEventType,
  formatPeriod,
  successFromForm,
  takesMadeOrMissed,
  type MadeOrMissed,
  type PlayFormState,
  type ReboundKind,
} from "./playCorrection";

// Regulation plus six overtimes: the API accepts periods 1-10.
const PERIOD_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

interface PlayEditFormProps {
  gameId: string;
  event: AdminGameEvent;
  playByPlay: AdminGamePlayByPlay;
  names: CorrectionNameLookup;
  onCancel: () => void;
  onSaved: (saved: SavedCorrection) => void;
}

/**
 * Edits one play with dropdowns (quarter, player, team, play type,
 * made/missed, rebound type, credit), a typed m:ss clock and the
 * description's text, plus a required reason. Saving is two steps: Preview
 * asks the API what the correction would change (fields and every
 * player's stats), then Confirm saves exactly that request. Changing any
 * input after a preview discards it, so what's confirmed is always what
 * was previewed.
 */
export function PlayEditForm({ gameId, event, playByPlay, names, onCancel, onSaved }: PlayEditFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<PlayFormState>(() => createPlayForm(event));
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ body: CorrectionRequestBody; outcome: CorrectionOutcome } | null>(null);

  const previewMutation = useMutation({
    mutationFn: (body: CorrectionRequestBody) => previewEventCorrection(gameId, event.sequence, body),
    onSuccess: (outcome, body) => setPreview({ body, outcome }),
  });
  const saveMutation = useMutation({
    mutationFn: (body: CorrectionRequestBody) => correctGameEvent(gameId, event.sequence, body),
    onSuccess: onSaved,
  });

  // The form sits above a long, scrollable table: bring it into view when
  // a play far down the table is opened.
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [event.sequence]);

  const { game, roster, events, eventTypes } = playByPlay;
  const actingPlayerIds = new Set(events.map((play) => play.playerId).filter((playerId): playerId is string => playerId !== null));
  const creditStat = creditStatFor(form.eventType, successFromForm(form));
  const typeOptions = eventTypes.includes(event.eventType) ? eventTypes : [event.eventType, ...eventTypes];

  /** Applies a change, dropping a credit the change made invalid. */
  function updateForm(patch: Partial<PlayFormState>) {
    setForm((previous) => dropInvalidCredit(previous, { ...previous, ...patch }, roster));
    setPreview(null);
    setFormError(null);
    previewMutation.reset();
    saveMutation.reset();
  }

  /** Picking a player also picks their team in this game. */
  function changePlayer(playerId: string) {
    const teamId = roster.find((player) => player.id === playerId)?.teamId;
    updateForm({ playerId, ...(teamId ? { teamId } : {}) });
  }

  function handlePreview(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    const result = buildCorrectionBody(event, form);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    previewMutation.mutate(result.body);
  }

  const errorMessage = formError ?? previewMutation.error?.message ?? saveMutation.error?.message ?? null;

  return (
    <form ref={formRef} onSubmit={handlePreview} className={PANEL_CLASS} aria-label="Correct play">
      <h2 className={SECTION_HEADING_CLASS}>
        Correct play #{event.sequence} · {formatPeriod(event.period)} {formatCorrectionValue("clock", event.clock, names)}
      </h2>
      <p className="mt-1 text-[12.5px] text-landing-ink">{event.description}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className={LABEL_CLASS}>Quarter</span>
          <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.period} onChange={(change) => updateForm({ period: Number(change.target.value) })}>
            {PERIOD_OPTIONS.map((period) => (
              <option key={period} value={period}>
                {formatPeriod(period)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Clock (m:ss)</span>
          <input className={`mt-1 w-full ${INPUT_CLASS}`} value={form.clock} placeholder="7:45" onChange={(change) => updateForm({ clock: change.target.value })} />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Play type</span>
          <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.eventType} onChange={(change) => updateForm({ eventType: change.target.value })}>
            {typeOptions.map((eventType) => (
              <option key={eventType} value={eventType}>
                {formatEventType(eventType)}
                {eventTypes.includes(eventType) ? "" : " (not in vocabulary)"}
              </option>
            ))}
          </select>
        </label>
        {takesMadeOrMissed(form.eventType) && (
          <label className="block">
            <span className={LABEL_CLASS}>Made / missed</span>
            <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.madeOrMissed} onChange={(change) => updateForm({ madeOrMissed: change.target.value as MadeOrMissed })}>
              <option value="">Choose…</option>
              <option value="made">Made</option>
              <option value="missed">Missed</option>
            </select>
          </label>
        )}
        {form.eventType === "rebound" && (
          <label className="block">
            <span className={LABEL_CLASS}>Rebound type</span>
            <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.reboundKind} onChange={(change) => updateForm({ reboundKind: change.target.value as ReboundKind })}>
              <option value="">Unclassified (not counted)</option>
              <option value="offensive">Offensive</option>
              <option value="defensive">Defensive</option>
            </select>
          </label>
        )}
        <label className="block">
          <span className={LABEL_CLASS}>Player</span>
          <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.playerId} onChange={(change) => changePlayer(change.target.value)}>
            <option value="">No player (team play)</option>
            {!roster.some((player) => player.id === event.playerId) && event.playerId && (
              <option value={event.playerId}>{event.playerName ?? event.playerId} (not in box score)</option>
            )}
            {[game.awayTeam, game.homeTeam].map((team) => (
              <optgroup key={team.id} label={team.abbreviation}>
                {roster
                  .filter((player) => player.teamId === team.id)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.firstName} {player.lastName}
                    </option>
                  ))}
              </optgroup>
            ))}
            {roster.some((player) => player.teamId === null) && (
              <optgroup label="Team unknown">
                {roster
                  .filter((player) => player.teamId === null)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.firstName} {player.lastName}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Team</span>
          <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.teamId} onChange={(change) => updateForm({ teamId: change.target.value })}>
            <option value="">No team</option>
            <option value={game.awayTeam.id}>{game.awayTeam.abbreviation} (away)</option>
            <option value={game.homeTeam.id}>{game.homeTeam.abbreviation} (home)</option>
          </select>
        </label>
        {creditStat && (
          <label className="block">
            <span className={LABEL_CLASS}>{CREDIT_LABELS[creditStat]}</span>
            <select className={`mt-1 w-full ${INPUT_CLASS}`} value={form.creditPlayerId} onChange={(change) => updateForm({ creditPlayerId: change.target.value })}>
              <option value="">None</option>
              {creditCandidates(creditStat, form, roster, actingPlayerIds).map((player) => (
                <option key={player.id} value={player.id}>
                  {player.firstName} {player.lastName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="mt-3 block">
        <span className={LABEL_CLASS}>Description text (the credit is set above)</span>
        <input className={`mt-1 w-full ${INPUT_CLASS}`} value={form.descriptionText} onChange={(change) => updateForm({ descriptionText: change.target.value })} />
      </label>
      <label className="mt-3 block">
        <span className={LABEL_CLASS}>Reason (required)</span>
        <input
          className={`mt-1 w-full ${INPUT_CLASS}`}
          value={form.reason}
          placeholder="e.g. Scorer credited the wrong player, per game video"
          onChange={(change) => updateForm({ reason: change.target.value })}
        />
      </label>

      {errorMessage && (
        <p role="alert" className="mt-3 text-[12.5px] text-locker-bad">
          {errorMessage}
        </p>
      )}
      {preview && <CorrectionPreview outcome={preview.outcome} names={names} />}

      <div className="mt-4 flex flex-wrap gap-2">
        {preview ? (
          <button type="button" className={`${BUTTON_CLASS} border-locker-leather`} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(preview.body)}>
            {saveMutation.isPending ? "Saving…" : "Confirm and save"}
          </button>
        ) : (
          <button type="submit" className={BUTTON_CLASS} disabled={previewMutation.isPending}>
            {previewMutation.isPending ? "Checking…" : "Preview changes"}
          </button>
        )}
        <button type="button" className={BUTTON_CLASS} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** What the correction would do: the play's fields, then each player's stats. */
function CorrectionPreview({ outcome, names }: { outcome: CorrectionOutcome; names: CorrectionNameLookup }) {
  return (
    <section aria-label="Correction preview" className="mt-4 border border-landing-light bg-landing-hero p-3">
      <h3 className={SECTION_HEADING_CLASS}>Preview</h3>
      <ul className="mt-2 space-y-1 text-[12.5px] text-landing-ink">
        {outcome.changes.map((change) => (
          <li key={change.field}>
            <span className="text-locker-ink-muted">{formatFieldLabel(change.field)}:</span>{" "}
            {formatCorrectionValue(change.field, change.from, names)} → {formatCorrectionValue(change.field, change.to, names)}
          </li>
        ))}
      </ul>
      {outcome.statChanges.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-locker-ink-muted">No player's counting stats change.</p>
      ) : (
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-landing-light">
              {["Player", "Stat", "Before", "After"].map((header) => (
                <th key={header} className={TABLE_HEADER_CELL_CLASS}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcome.statChanges.flatMap((player) =>
              player.stats.map((stat) => (
                <tr key={`${player.playerId}-${stat.field}`} className="border-b border-landing-light last:border-b-0">
                  <td className="px-3 py-1.5 text-[12.5px] text-landing-ink">{player.playerName}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-locker-ink-muted">{formatStatLabel(stat.field)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-locker-ink-muted">{formatStatValue(stat.before)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-landing-ink">{stat.after}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
