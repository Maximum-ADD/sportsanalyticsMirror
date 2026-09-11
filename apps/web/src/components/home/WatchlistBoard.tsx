import { Link } from "react-router-dom";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { LockerSection } from "./LockerSection";
import { PointsSparkline } from "./PointsSparkline";
import type { WatchlistEntry } from "./placeholderData";

interface WatchlistBoardProps {
  entries: WatchlistEntry[];
}

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

// The accumulating core asset and the page's largest area. When this is
// wired up, compute the averages with ONE groupBy over PlayerGameStat —
// looping the per-player StatsService turns this into an N+1 that runs on
// every homepage load.
export function WatchlistBoard({ entries }: WatchlistBoardProps) {
  return (
    <LockerSection
      title={`Your watchlist · ${entries.length} players`}
      action={
        <button
          type="button"
          className="font-mono text-[10px] tracking-[0.14em] whitespace-nowrap text-locker-ink-muted uppercase hover:text-locker-leather"
        >
          Manage
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
          Nothing here yet. Follow a player and this board fills out.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => {
            const fullName = `${entry.player.firstName} ${entry.player.lastName}`;
            return (
              <li key={entry.player.nbaPlayerId}>
                <Link
                  to={`/players/${entry.player.nbaPlayerId}`}
                  className="block border border-landing-light bg-locker-surface p-3 transition-colors hover:border-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
                >
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <PlayerHeadshot
                      player={entry.player}
                      size="sm"
                      className="size-8 bg-[#c3bfb9] text-locker-ink-muted"
                    />
                    <span className="text-[12.5px] leading-tight font-semibold text-landing-ink">
                      {fullName}
                    </span>
                    <TeamBadge team={entry.team} size="sm" className="ml-auto" />
                  </div>

                  <div className="mb-2 flex gap-4">
                    <StatPair label="PPG" value={entry.pointsPerGame} />
                    <StatPair label="RPG" value={entry.reboundsPerGame} />
                    <StatPair label="APG" value={entry.assistsPerGame} />
                  </div>

                  <PointsSparkline points={entry.recentPoints} playerName={fullName} />

                  {entry.note && (
                    <p className="mt-2 border-l-2 border-locker-leather pl-2 text-[11px] text-locker-ink-muted italic">
                      {entry.note}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </LockerSection>
  );
}
