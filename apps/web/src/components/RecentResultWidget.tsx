import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGames } from "@/lib/nbaApi";
import { TeamBadge } from "@/components/TeamBadge";
import { Skeleton } from "@/components/ui/skeleton";

// Deliberately labelled "Recent Result", not "Live" — there's no live game
// tracking in this app, and the earlier UI mockup this was based on had a
// "LIVE" ticker we don't actually have data to back honestly.
export function RecentResultWidget() {
  const captionId = useId();
  const { data, isPending, isError } = useQuery({
    queryKey: ["games", { pageSize: 1 }],
    queryFn: () => fetchGames({ pageSize: 1 }),
  });

  if (isError) return null;

  if (isPending) {
    return <Skeleton className="h-12 w-56 rounded-xl" />;
  }

  const game = data?.data[0];
  if (!game) return null;

  return (
    <div
      role="group"
      aria-labelledby={captionId}
      className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-2 shadow-lg shadow-black/30"
    >
      <span
        id={captionId}
        className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-text-muted"
      >
        Recent Result
      </span>

      {/* The badge/score/badge row below reads as noise to a screen reader;
          it gets this sentence instead. */}
      <p className="sr-only">
        {game.homeTeam.abbreviation} {game.homeScore}, {game.awayTeam.abbreviation} {game.awayScore}
      </p>

      <div aria-hidden className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <TeamBadge team={game.homeTeam} size="sm" />
        <span>{game.homeScore}</span>
        <span className="text-text-muted">–</span>
        <span>{game.awayScore}</span>
        <TeamBadge team={game.awayTeam} size="sm" />
      </div>
    </div>
  );
}
