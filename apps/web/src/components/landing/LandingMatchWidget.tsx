import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGames } from "@/lib/nbaApi";
import { TeamBadge } from "@/components/TeamBadge";
import { Skeleton } from "@/components/ui/skeleton";

export function LandingMatchWidget() {
  const captionId = useId();
  const { data, isPending, isError } = useQuery({
    queryKey: ["games", { pageSize: 1 }],
    queryFn: () => fetchGames({ pageSize: 1 }),
  });

  if (isError) return null;

  if (isPending) {
    return <Skeleton className="leather-texture h-[9.5rem] w-44 rounded-none opacity-70" />;
  }

  const game = data?.data[0];
  if (!game) return null;

  return (
    <div
      role="group"
      aria-labelledby={captionId}
      className="leather-texture w-44 px-3 py-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
    >
      <p id={captionId} className="text-[9px] font-bold tracking-[0.14em] text-white uppercase">
        Match Updates
      </p>
      <p className="sr-only">
        Most recent result: {game.homeTeam.abbreviation} {game.homeScore}, {game.awayTeam.abbreviation}{" "}
        {game.awayScore}
      </p>
      <div aria-hidden className="mt-2.5 flex items-start justify-between gap-1">
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <TeamBadge team={game.homeTeam} size="md" className="bg-white/90" />
          <span className="text-xl leading-none font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
            {game.homeScore}
          </span>
        </div>
        <span className="pt-3 text-[10px] font-semibold text-white/80">VS</span>
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <TeamBadge team={game.awayTeam} size="md" className="bg-white/90" />
          <span className="text-xl leading-none font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
            {game.awayScore}
          </span>
        </div>
      </div>
    </div>
  );
}
