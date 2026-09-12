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

  // h-10 sits inside the h-14 landing header row with an 8px margin above
  // and below, so it reads as part of the bar rather than a strip bleeding
  // out of it. The loading placeholder mirrors that same height, as a
  // faint white wash rather than a raised panel, so it blends the way the
  // resolved banner does and the row doesn't shift when the game lands.
  if (isPending) {
    return <Skeleton className="h-10 w-56 bg-white/10 opacity-70" />;
  }

  const game = data?.data[0];
  if (!game) return null;

  return (
    <div
      role="group"
      aria-labelledby={captionId}
      className="relative flex h-10 items-center gap-3"
    >
      <p id={captionId} className="sr-only">
        Match Updates
      </p>
      <p className="sr-only">
        Most recent result: {game.homeTeam.abbreviation} {game.homeScore}, {game.awayTeam.abbreviation}{" "}
        {game.awayScore}
      </p>
      {/* Deliberately no panel: no background, border, or sheen, so the
          banner blends straight into the header's bg-landing-ink. All
          contrast comes from the white logo discs and the white mono
          score, and the hairline rule below is the only structure
          separating the two halves. */}
      {/* Logo VS logo, nothing drawn between them — with the panel gone,
          the orange center line read as a stray mark on the bar rather
          than a court cue. The badges render at size-8 (TeamBadge's
          className override wins over its md size-10 via tailwind-merge)
          so two of them fill most of the banner's height — the largest
          they can be while still clearing it with an even ring of
          background around each disc. */}
      <div aria-hidden className="relative flex items-center gap-1.5">
        <TeamBadge team={game.homeTeam} size="md" className="relative size-8 bg-white/90" />
        <span className="relative px-0.5 font-mono text-[9px] tracking-[0.1em] text-white uppercase">VS</span>
        <TeamBadge team={game.awayTeam} size="md" className="relative size-8 bg-white/90" />
      </div>
      {/* Hairline separating "who played" from "how it ended". With no
          panel around the banner this vertical rule is the only structure,
          so it sits a touch stronger than it needed to against the old
          box edge. The visible score is aria-hidden because the sr-only
          caption above already announces the result — repeating it here
          would double every screen-reader visit. */}
      <div aria-hidden className="h-5 w-px bg-white/20" />
      <div
        aria-hidden
        className="flex items-baseline gap-1.5 font-mono text-xs whitespace-nowrap text-white uppercase"
      >
        <span>
          {game.homeTeam.abbreviation} <span className="tabular-nums">{game.homeScore}</span>
        </span>
        <span className="text-white/40">-</span>
        <span>
          <span className="tabular-nums">{game.awayScore}</span> {game.awayTeam.abbreviation}
        </span>
        <span className="text-[9px] text-white/50">final</span>
      </div>
    </div>
  );
}
