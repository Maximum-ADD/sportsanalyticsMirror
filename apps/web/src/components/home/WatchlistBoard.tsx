import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/apiClient";
import { fetchWatchlist, unfollowPlayer, updateWatchlistNote } from "@/lib/nbaApi";
import { signInWithGoogle } from "@/lib/authClient";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { LockerSection } from "./LockerSection";
import { PointsSparkline } from "./PointsSparkline";
import type { WatchlistEntry } from "@/types/nba";

const UNAUTHENTICATED_STATUS = 401;

// Matches MAX_NOTE_LENGTH on the API's updatePlayerNoteSchema. Enforced here
// too so the user hits a counter rather than a 400.
const MAX_NOTE_LENGTH = 500;

// The board is the page's largest module and the one that accumulates value,
// so it asks for more than a default page in a single request. 100 is the
// API's own pageSize cap; past that the board would need real pagination,
// which a home-page module is the wrong place for.
const BOARD_PAGE_SIZE = 100;

/** The query key every watchlist mutation invalidates. */
const WATCHLIST_KEY = ["watchlist"];

function StatPair({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="block font-mono text-[9px] tracking-[0.14em] text-locker-ink-muted uppercase">
        {label}
      </span>
      <span className="block font-display text-lg text-landing-ink tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

/**
 * The players this user follows, with how they are actually doing and the
 * user's own notes on them.
 *
 * Reads GET /v1/me/watchlist, which derives every figure from PlayerGameStat
 * rows the ingestion already holds — nothing here is stored or invented. The
 * board is also where the follow is *managed*: a note can be written or
 * cleared, and a player can be dropped, both against the follow routes. That
 * is the whole reason this page needs an account: the averages are public,
 * but which nine players you care about and what you wrote about them are not.
 */
export function WatchlistBoard() {
  const watchlistQuery = useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: () => fetchWatchlist({ pageSize: BOARD_PAGE_SIZE }),
    // Signed out is a state, not a fault; retrying a 401 only delays it.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS) && failureCount < 2,
  });

  if (watchlistQuery.isPending) {
    return (
      <LockerSection title="Your watchlist">
        <div className="flex min-h-32 items-center justify-center border border-landing-light bg-locker-surface">
          <BasketballSpinner label="Loading your watchlist" />
        </div>
      </LockerSection>
    );
  }

  const error = watchlistQuery.error;

  if (error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS) {
    return (
      <LockerSection title="Your watchlist">
        <div className="border border-dashed border-landing-light bg-locker-surface p-5">
          <p className="mb-3.5 max-w-[62ch] text-[12.5px] text-locker-ink-muted">
            Follow the players you actually care about and this board keeps their scoring, rebounding and
            assists in one place, with whatever you want to note about them. It is kept to your account,
            which is why it needs one.
          </p>
          <button
            type="button"
            onClick={() => signInWithGoogle(window.location.href)}
            className="leather-texture h-11 px-5 font-display text-sm tracking-[0.07em] text-white uppercase transition-opacity hover:opacity-90"
          >
            Sign in to build one
          </button>
        </div>
      </LockerSection>
    );
  }

  if (watchlistQuery.isError || !watchlistQuery.data) {
    return (
      <LockerSection title="Your watchlist">
        <div className="border border-landing-light bg-locker-surface p-5">
          <p className="text-[12.5px] text-locker-bad">Could not load your watchlist.</p>
          <button
            type="button"
            onClick={() => watchlistQuery.refetch()}
            className="mt-2 text-[12.5px] text-locker-leather underline underline-offset-[3px]"
          >
            Try again
          </button>
        </div>
      </LockerSection>
    );
  }

  const entries = watchlistQuery.data.data;

  return (
    <LockerSection
      title={`Your watchlist · ${watchlistQuery.data.total} ${watchlistQuery.data.total === 1 ? "player" : "players"}`}
      action={
        <Link
          to="/players"
          className="font-mono text-[10px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase hover:text-locker-leather"
        >
          Add players
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
          Nothing here yet.{" "}
          <Link to="/players" className="text-locker-leather underline underline-offset-[3px]">
            Find a player
          </Link>{" "}
          and follow them — this board fills out from the boxscores we already hold.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.player.id}>
              <WatchlistCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </LockerSection>
  );
}

/**
 * One followed player: their numbers, their trend, and the two things the
 * user can do about them.
 *
 * The card is not itself a link. It used to be, but it now carries buttons,
 * and an anchor wrapping a button is invalid HTML that keyboard and screen
 * reader users hit first — so the player's name is the link and the controls
 * sit outside it.
 */
function WatchlistCard({ entry }: { entry: WatchlistEntry }) {
  const queryClient = useQueryClient();
  const [isEditingNote, setIsEditingNote] = useState(false);
  const fullName = `${entry.player.firstName} ${entry.player.lastName}`;

  const removeMutation = useMutation({
    mutationFn: () => unfollowPlayer(entry.player.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const noteMutation = useMutation({
    mutationFn: (note: string | null) => updateWatchlistNote(entry.player.id, note),
    onSuccess: () => {
      setIsEditingNote(false);
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });

  const { seasonAverages } = entry;
  // The API sends the most recent game first; a sparkline reads left to right
  // in time, so it has to be reversed rather than plotted as delivered.
  const pointsOldestFirst = [...entry.recentPoints].reverse().map((game) => game.points);
  const errorMessage =
    removeMutation.error instanceof Error
      ? removeMutation.error.message
      : noteMutation.error instanceof Error
        ? noteMutation.error.message
        : null;

  return (
    <div className="flex h-full flex-col border border-landing-light bg-locker-surface p-3">
      <div className="mb-2.5 flex items-center gap-2.5">
        <PlayerHeadshot
          player={entry.player}
          size="sm"
          className="size-8 bg-[#c3bfb9] text-locker-ink-muted"
        />
        <Link
          to={`/players/${entry.player.id}`}
          className="text-[12.5px] leading-tight font-semibold text-landing-ink underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
        >
          {fullName}
        </Link>
        {entry.player.team && (
          <TeamBadge
            team={{ abbreviation: entry.player.team.abbreviation, nbaTeamId: entry.player.team.nbaTeamId }}
            size="sm"
            className="ml-auto"
          />
        )}
      </div>

      <div className="mb-2 flex gap-4">
        <StatPair label="PPG" value={seasonAverages.pointsPerGame} />
        <StatPair label="RPG" value={seasonAverages.reboundsPerGame} />
        <StatPair label="APG" value={seasonAverages.assistsPerGame} />
      </div>

      {/* An honest empty state beats a flat line at zero: a followed player
          with no boxscores has not played, which is not the same as scoring
          nothing. */}
      {pointsOldestFirst.length > 0 ? (
        <PointsSparkline points={pointsOldestFirst} playerName={fullName} />
      ) : (
        <p className="text-[11px] text-locker-ink-muted">No games on record yet.</p>
      )}

      {isEditingNote ? (
        <NoteEditor
          initialNote={entry.note}
          isSaving={noteMutation.isPending}
          onCancel={() => {
            noteMutation.reset();
            setIsEditingNote(false);
          }}
          onSave={(note) => noteMutation.mutate(note)}
          playerName={fullName}
        />
      ) : (
        entry.note && (
          <p className="mt-2 border-l-2 border-locker-leather pl-2 text-[11px] text-locker-ink-muted italic">
            {entry.note}
          </p>
        )
      )}

      {errorMessage && (
        <p role="alert" className="mt-2 text-[11px] text-locker-bad">
          {errorMessage}
        </p>
      )}

      {!isEditingNote && (
        <div className="mt-auto flex gap-3 pt-2.5">
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className="font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase hover:text-locker-leather"
          >
            {entry.note ? "Edit note" : "Add note"}
          </button>
          <button
            type="button"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
            className="ml-auto font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase hover:text-locker-bad disabled:opacity-50"
          >
            {removeMutation.isPending ? "Removing…" : "Remove"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The inline note form.
 *
 * Saving an empty box clears the note rather than storing "", because the API
 * models "no note" as null and a blank string would render as an empty quote
 * block on the card.
 */
function NoteEditor({
  initialNote,
  isSaving,
  onCancel,
  onSave,
  playerName,
}: {
  initialNote: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (note: string | null) => void;
  playerName: string;
}) {
  const [draft, setDraft] = useState(initialNote ?? "");
  const trimmed = draft.trim();

  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(trimmed.length === 0 ? null : trimmed);
      }}
    >
      <label className="sr-only" htmlFor={`note-${playerName}`}>
        Note on {playerName}
      </label>
      <textarea
        id={`note-${playerName}`}
        value={draft}
        maxLength={MAX_NOTE_LENGTH}
        rows={2}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        placeholder="What are you watching for?"
        className="w-full resize-y border border-landing-light bg-landing-hero px-2 py-1.5 text-[11.5px] text-landing-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-locker-leather"
      />
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="font-mono text-[9.5px] tracking-[0.12em] text-locker-leather uppercase hover:text-landing-ink disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase hover:text-landing-ink"
        >
          Cancel
        </button>
        <span className="ml-auto font-mono text-[9px] text-locker-ink-muted tabular-nums">
          {draft.length}/{MAX_NOTE_LENGTH}
        </span>
      </div>
    </form>
  );
}
