import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGames } from "@/lib/nbaApi";
import { TeamBadge } from "@/components/TeamBadge";
import { Skeleton } from "@/components/ui/skeleton";

export function LandingMatchWidget() {
  const captionId = useId();
  // status: "completed" — this widget shows a final score, so an upcoming
  // game (null homeScore/awayScore) is never a valid result here.
  const { data, isPending, isError } = useQuery({
    queryKey: ["games", { pageSize: 1, status: "completed" as const }],
    queryFn: () => fetchGames({ pageSize: 1, status: "completed" }),
  });

  if (isError) return null;

  if (isPending) {
    return <Skeleton className="h-36 w-44 rounded-none opacity-70" />;
  }

  const game = data?.data[0];
  if (!game) return null;

  return (
    <div
      role="group"
      aria-labelledby={captionId}
      className="relative flex h-36 w-44 flex-col shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
    >
      <p className="sr-only">
        Most recent result: {game.homeTeam.abbreviation} {game.homeScore}, {game.awayTeam.abbreviation}{" "}
        {game.awayScore}
      </p>
      {/* Glass-like sheen sweeping across the whole card, on top of every
          band — a flat gradient rather than a real reflection, but enough
          to read as "glossy" instead of matte. pointer-events-none so it
          never intercepts a click meant for the card underneath. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/25 via-white/5 to-transparent"
      />
      <p id={captionId} className="bg-black py-1.5 text-center font-mono text-[10px] tracking-[0.14em] text-white uppercase">
        Match Updates
      </p>
      {/* A dark court, not a real photo — CSS-only so there's no image
          cropping/artifact risk. The center line (a 2px vertical bar) and
          center circle (a plain ring) run right through "VS", the same
          spot a real court's center line splits the two team benches. */}
      <div className="relative flex-1 overflow-hidden bg-surface-nav px-3 py-1.5">
        <div aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-brand-accent/70" />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-accent/70"
        />
        <div aria-hidden className="relative flex h-full items-center justify-between gap-1">
          <TeamBadge team={game.homeTeam} size="md" className="bg-white/90" />
          <span className="font-mono text-[10px] tracking-[0.1em] text-white uppercase">VS</span>
          <TeamBadge team={game.awayTeam} size="md" className="bg-white/90" />
        </div>
      </div>
      <div aria-hidden className="flex items-center justify-between bg-black px-3 py-1.5">
        <span className="font-mono text-[13px] text-white uppercase">
          {game.homeTeam.abbreviation} <span className="tabular-nums">{game.homeScore}</span>
        </span>
        <span className="font-mono text-[9px] text-white/50 uppercase">final</span>
        <span className="font-mono text-[13px] text-white uppercase">
          <span className="tabular-nums">{game.awayScore}</span> {game.awayTeam.abbreviation}
        </span>
      </div>
    </div>
  );
}
