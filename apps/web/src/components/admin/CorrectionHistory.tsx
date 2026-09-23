import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminCorrections, revertEventCorrection, type EventCorrection, type SavedCorrection } from "@/lib/adminApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { BUTTON_CLASS, INPUT_CLASS, PAGE_SIZE, SECTION_HEADING_CLASS, TABLE_HEADER_CELL_CLASS } from "./adminStyles";
import { formatCorrectionValue, formatFieldLabel, type CorrectionNameLookup } from "./correctionFormatting";
import { ADMIN_CORRECTIONS_QUERY_KEY, refreshAfterCorrection } from "./correctionQueries";

const HISTORY_TABLE_HEADERS = ["Game", "Play", "Change", "Reason", "By", "When", ""];

/** Names for one row's ids: its own player names and the game's two teams. */
function namesFor(correction: EventCorrection): CorrectionNameLookup {
  const { homeTeam, awayTeam } = correction.game;
  return {
    playerNames: correction.playerNames,
    teamNames: { [homeTeam.id]: homeTeam.abbreviation, [awayTeam.id]: awayTeam.abbreviation },
  };
}

interface CorrectionHistoryProps {
  // Only this game's corrections when set; every game's otherwise.
  gameId: string | null;
  onReverted: (saved: SavedCorrection) => void;
}

/**
 * The audit trail: for each correction, the game, the play, every field's
 * old -> new value, the reason, who made it and when. Each row can be
 * undone once (with its own reason), which records a new correction
 * rather than deleting this one; the API refuses (409) if a later
 * correction has since changed the same fields.
 */
export function CorrectionHistory({ gameId, onReverted }: CorrectionHistoryProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoReason, setUndoReason] = useState("");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [ADMIN_CORRECTIONS_QUERY_KEY, { gameId, page }],
    queryFn: () => fetchAdminCorrections({ gameId: gameId ?? undefined, page, pageSize: PAGE_SIZE }),
  });
  const undoMutation = useMutation({
    mutationFn: (correction: EventCorrection) => revertEventCorrection(correction.id, undoReason.trim()),
    onSuccess: async (saved) => {
      setUndoingId(null);
      setUndoReason("");
      onReverted(saved);
      await refreshAfterCorrection(queryClient, saved.gameId);
    },
  });

  function startUndo(correctionId: string) {
    setUndoingId(correctionId);
    setUndoReason("");
    undoMutation.reset();
  }

  if (isError) return <ErrorState message="Could not load corrections." onRetry={() => refetch()} />;

  return (
    <section aria-label="Correction history" className="space-y-3">
      <h2 className={SECTION_HEADING_CLASS}>{gameId ? "This game's correction history" : "Correction history (all games)"}</h2>
      {isPending ? (
        <div className="flex min-h-40 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading corrections" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {HISTORY_TABLE_HEADERS.map((header) => (
                  <th key={header} className={TABLE_HEADER_CELL_CLASS}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.length === 0 ? (
                <tr>
                  <td colSpan={HISTORY_TABLE_HEADERS.length} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No corrections recorded yet.
                  </td>
                </tr>
              ) : (
                data.data.map((correction) => {
                  const names = namesFor(correction);
                  const isUndoing = undoingId === correction.id;
                  return (
                    <tr key={correction.id} className="border-b border-landing-light align-top last:border-b-0">
                      <td className="px-3 py-2.5">
                        <div className="text-[12.5px] whitespace-nowrap text-landing-ink">
                          {correction.game.awayTeam.abbreviation} @ {correction.game.homeTeam.abbreviation}
                        </div>
                        <div className="font-mono text-[10px] text-locker-ink-muted">
                          {new Date(correction.game.gameDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">#{correction.sequence}</td>
                      <td className="px-3 py-2.5">
                        {correction.revertsCorrectionId && (
                          <span className="mb-1 inline-block bg-landing-hero px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] text-locker-ink-muted uppercase">
                            Undo
                          </span>
                        )}
                        <ul className="space-y-0.5 text-[11.5px] text-landing-ink">
                          {Object.keys(correction.newValues).map((field) => (
                            <li key={field} className="max-w-md break-words">
                              <span className="text-locker-ink-muted">{formatFieldLabel(field)}:</span>{" "}
                              {formatCorrectionValue(field, correction.previousValues[field], names)} →{" "}
                              {formatCorrectionValue(field, correction.newValues[field], names)}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-locker-ink-muted">{correction.reason ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{correction.correctedBy?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-locker-ink-muted">
                        {new Date(correction.correctedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {correction.revertedBy ? (
                          <span className="font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">Undone</span>
                        ) : isUndoing ? (
                          <span className="inline-flex flex-col items-end gap-1.5">
                            <input
                              aria-label="Reason for undoing"
                              className={`${INPUT_CLASS} w-48`}
                              placeholder="Why undo this?"
                              value={undoReason}
                              onChange={(event) => setUndoReason(event.target.value)}
                            />
                            <span className="inline-flex gap-2">
                              <button
                                type="button"
                                className={BUTTON_CLASS}
                                disabled={!undoReason.trim() || undoMutation.isPending}
                                onClick={() => undoMutation.mutate(correction)}
                              >
                                {undoMutation.isPending ? "Undoing…" : "Confirm undo"}
                              </button>
                              <button type="button" className={BUTTON_CLASS} onClick={() => setUndoingId(null)}>
                                Cancel
                              </button>
                            </span>
                            {undoMutation.isError && (
                              <span role="alert" className="max-w-56 text-left text-[11px] text-locker-bad">
                                {undoMutation.error.message}
                              </span>
                            )}
                          </span>
                        ) : (
                          <button type="button" className={BUTTON_CLASS} onClick={() => startUndo(correction.id)}>
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </section>
  );
}
