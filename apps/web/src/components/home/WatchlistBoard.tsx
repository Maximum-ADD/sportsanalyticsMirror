import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/apiClient";
import { fetchWatchlist } from "@/lib/nbaApi";
import { unfollowPlayer } from "@/lib/meApi";
import { ME_QUERY_KEY } from "@/lib/useMe";
import { signInWithGoogle } from "@/lib/authClient";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { LockerSection } from "./LockerSection";
import { PointsSparkline } from "./PointsSparkline";
import type { WatchlistEntry } from "@/types/nba";

const UNAUTHENTICATED_STATUS = 401;

// The board asks for more than a default page in one request; 100 is the
// API's own pageSize cap. Past that this would need real pagination, which a
// home-page module is the wrong place for.
const BOARD_PAGE_SIZE = 100;

/** The query key the unfollow mutation invalidates, alongside the profile. */
export const WATCHLIST_QUERY_KEY = ["watchlist"];

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
 * The players this user follows, with how they are actually doing.
 *
 * Reads GET /v1/me/watchlist, which derives every figure at request time from
 * the PlayerGameStat rows the ingestion already holds — nothing here is stored
 * or invented. Who you follow comes from the same follow graph the rest of the
 * app writes (User.followedPlayers via /v1/me/followed-players/:playerId), so
 * a player followed during onboarding or from a player page appears here
 * immediately, and removing one here removes it everywhere.
 *
 * This is the page's clearest argument for having an account: the averages
 * are public, but which players you care about is not.
 */
export function WatchlistBoard() {
  const watchlistQuery = useQuery({
    queryKey: WATCHLIST_QUERY_KEY,
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
            assists in one place. It is kept to your account, which is why it needs one.
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

  const { data: entries, total } = watchlistQuery.data;

  return (
    <LockerSection
      title={`Your watchlist · ${total} ${total === 1 ? "player" : "players"}`}
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
 * One followed player: their numbers, their trend, and a way to drop them.
 *
 * The card is not itself a link. It carries a button, and an anchor wrapping
 * a button is invalid HTML that keyboard and screen reader users hit first —
 * so the player's name is the link and the control sits outside it.
 */
function WatchlistCard({ entry }: { entry: WatchlistEntry }) {
  const queryClient = useQueryClient();
  const fullName = `${entry.player.firstName} ${entry.player.lastName}`;

  const removeMutation = useMutation({
    mutationFn: () => unfollowPlayer(entry.player.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY });
      // The same follow graph backs the profile, and the follow buttons on
      // the player pages render from it — leaving it stale would show a
      // player as followed right after they were dropped here.
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });

  const { seasonAverages } = entry;
  // The API sends the most recent game first; a sparkline reads left to right
  // in time, so it has to be reversed rather than plotted as delivered.
  const pointsOldestFirst = [...entry.recentPoints].reverse().map((game) => game.points);

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

      {removeMutation.error instanceof Error && (
        <p role="alert" className="mt-2 text-[11px] text-locker-bad">
          {removeMutation.error.message}
        </p>
      )}

      <div className="mt-auto flex pt-2.5">
        <button
          type="button"
          disabled={removeMutation.isPending}
          onClick={() => removeMutation.mutate()}
          aria-label={`Remove ${fullName} from your watchlist`}
          className="ml-auto font-mono text-[9.5px] tracking-[0.12em] text-locker-ink-muted uppercase hover:text-locker-bad disabled:opacity-50"
        >
          {removeMutation.isPending ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}
