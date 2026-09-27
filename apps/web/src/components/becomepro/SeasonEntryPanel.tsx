import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GameEntryRow } from "@/components/becomepro/GameEntryRow";
import { ApiError } from "@/lib/apiClient";
import {
  createProspectGame,
  deleteProspectGame,
  invalidateBecomeProQueries,
  updateProspectGame,
} from "@/lib/becomeProApi";
import type { ProspectGame, ProspectGameInput, ProspectSeason } from "@/types/nba";

interface SeasonEntryPanelProps {
  season: ProspectSeason;
  games: ProspectGame[];
}

// The API sends a game's date as a full ISO timestamp; a date input wants
// "YYYY-MM-DD". Sliced rather than parsed so a midnight-UTC date cannot shift
// a day in the user's own timezone.
function toDateInput(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function toInput(game: ProspectGame): ProspectGameInput {
  return {
    gameDate: toDateInput(game.gameDate),
    opponent: game.opponent,
    minutes: game.minutes,
    points: game.points,
    rebounds: game.rebounds,
    assists: game.assists,
    steals: game.steals,
    blocks: game.blocks,
    turnovers: game.turnovers,
    fieldGoalsMade: game.fieldGoalsMade,
    fieldGoalsAttempted: game.fieldGoalsAttempted,
    threesMade: game.threesMade,
    threesAttempted: game.threesAttempted,
    freeThrowsMade: game.freeThrowsMade,
    freeThrowsAttempted: game.freeThrowsAttempted,
  };
}

function errorText(error: unknown, fallback: string): string {
  // The API's { error: { code, message } } envelope already reads as a
  // sentence, and it names which game clashed — a generic line would hide that.
  return error instanceof ApiError ? error.message : fallback;
}

// min-h-9 below sm, as FollowPlayerButton does: at table density these are
// small targets, and on a phone they are the only way to correct a game.
const SMALL_BUTTON =
  "min-h-9 border border-landing-light px-2 py-1 sm:min-h-0 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase transition-colors";

/**
 * The user's logged games for one season: add a game, correct one, remove one.
 *
 * Deliberately shows no derived-season preview of its own. The page this sits
 * on already renders the server's season line, and every mutation here
 * refetches it — the server re-values the season on each write — so a second,
 * locally-derived copy could only ever disagree with the real one.
 */
export function SeasonEntryPanel({ season, games }: SeasonEntryPanelProps) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (game: ProspectGameInput) => createProspectGame(season.id, game),
    onSuccess: () => {
      setSaveError(null);
      return invalidateBecomeProQueries(queryClient);
    },
    onError: (error: unknown) => setSaveError(errorText(error, "Couldn't save that game. Please try again.")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ gameId, game }: { gameId: string; game: ProspectGameInput }) => updateProspectGame(gameId, game),
    onSuccess: () => {
      setEditError(null);
      return invalidateBecomeProQueries(queryClient);
    },
    onError: (error: unknown) => setEditError(errorText(error, "Couldn't save that correction. Please try again.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (gameId: string) => deleteProspectGame(gameId),
    onSuccess: () => {
      setPendingDeleteId(null);
      return invalidateBecomeProQueries(queryClient);
    },
  });

  // Newest first for the table; the entry form's "copy last game" wants the
  // most recently played one, which is the same row.
  const gamesNewestFirst = [...games].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  const lastGame = gamesNewestFirst[0] ? toInput(gamesNewestFirst[0]) : undefined;
  const editingGame = gamesNewestFirst.find((game) => game.id === editingId);

  return (
    <div>
      {/* Hidden while a correction is open, so there is only ever one form
          taking keystrokes and Enter can only ever mean one thing. */}
      {editingGame ? (
        <GameEntryRow
          key={editingGame.id}
          editing={toInput(editingGame)}
          onSave={(game) => updateMutation.mutateAsync({ gameId: editingGame.id, game })}
          onCancel={() => {
            setEditingId(null);
            setEditError(null);
          }}
          isSaving={updateMutation.isPending}
          errorMessage={editError}
        />
      ) : (
        <GameEntryRow
          onSave={(game) => createMutation.mutateAsync(game)}
          isSaving={createMutation.isPending}
          lastGame={lastGame}
          errorMessage={saveError}
        />
      )}

      {games.length === 0 ? (
        <p className="mt-3 border border-dashed border-landing-light bg-landing-hero p-5 text-center text-[12.5px] text-locker-ink-muted">
          No games logged yet. Your season line is worked out from these rows, so it appears as soon as the
          first one does.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">Every game logged for this season, most recent first</caption>
            <thead>
              <tr className="border-b border-landing-light">
                {["Date", "Opponent", "MIN", "PTS", "REB", "AST", "FG", "3P", "FT"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="pr-3 pb-1.5 font-mono text-[9px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase"
                  >
                    {heading}
                  </th>
                ))}
                <th scope="col" className="pb-1.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gamesNewestFirst.map((game) => (
                <tr
                  key={game.id}
                  className={`border-b border-landing-light/60 ${game.id === editingId ? "bg-landing-hero" : ""}`}
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap text-locker-ink-muted tabular-nums">
                    {toDateInput(game.gameDate)}
                  </td>
                  <td className="py-1.5 pr-3 text-landing-ink">{game.opponent}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{game.minutes}</td>
                  <td className="py-1.5 pr-3 font-semibold tabular-nums">{game.points}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{game.rebounds}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{game.assists}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                    {game.fieldGoalsMade}-{game.fieldGoalsAttempted}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                    {game.threesMade}-{game.threesAttempted}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                    {game.freeThrowsMade}-{game.freeThrowsAttempted}
                  </td>
                  <td className="py-1.5 text-right">
                    {/* Two-click confirm, the same shape DeleteAccountControl
                        uses — removing a game can move the valuation. */}
                    {pendingDeleteId === game.id ? (
                      <span className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(game.id)}
                          disabled={deleteMutation.isPending}
                          className={`${SMALL_BUTTON} border-locker-bad text-locker-bad disabled:opacity-50`}
                        >
                          Confirm
                        </button>
                        <button type="button" onClick={() => setPendingDeleteId(null)} className={SMALL_BUTTON}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Edit the game against ${game.opponent} on ${toDateInput(game.gameDate)}`}
                          onClick={() => {
                            setEditingId(game.id);
                            setEditError(null);
                          }}
                          className={`${SMALL_BUTTON} hover:border-locker-leather hover:text-landing-ink`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove the game against ${game.opponent} on ${toDateInput(game.gameDate)}`}
                          onClick={() => setPendingDeleteId(game.id)}
                          className={`${SMALL_BUTTON} hover:border-locker-bad hover:text-locker-bad`}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
