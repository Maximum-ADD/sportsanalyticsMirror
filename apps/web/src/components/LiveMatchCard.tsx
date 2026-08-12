import { useId } from "react";
import { cn } from "@/lib/utils";
import { TeamBadge } from "./TeamBadge";

export interface LiveMatchTeam {
  abbreviation: string;
  score: number;
}

export interface LiveMatchSummary {
  away: LiveMatchTeam;
  home: LiveMatchTeam;
}

// Placeholder: there is no games endpoint, and Prisma's Game model has no
// status column, so the backend cannot report a game as live yet. Kept behind
// the optional `match` prop so a real feed is a one-line change at the call site.
const PLACEHOLDER_MATCH: LiveMatchSummary = {
  away: { abbreviation: "BOS", score: 24 },
  home: { abbreviation: "LAL", score: 38 },
};

interface LiveMatchCardProps {
  match?: LiveMatchSummary;
  className?: string;
}

export function LiveMatchCard({ match = PLACEHOLDER_MATCH, className }: LiveMatchCardProps) {
  const captionId = useId();
  const { away, home } = match;

  return (
    <div
      role="group"
      aria-labelledby={captionId}
      data-slot="live-match-card"
      data-placeholder="true"
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-card px-3.5 py-2.5 shadow-lg shadow-black/40",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {/* motion-safe: leaves a static dot under prefers-reduced-motion. */}
        <span
          aria-hidden
          data-slot="live-match-dot"
          className="size-1.5 shrink-0 rounded-full bg-red-500 motion-safe:animate-pulse"
        />
        <span
          id={captionId}
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary"
        >
          Live match updates
        </span>
      </div>

      {/* The visual row below linearises into noise, so screen readers get this
          sentence instead. */}
      <p className="sr-only">
        {away.abbreviation} {away.score}, {home.abbreviation} {home.score}
      </p>

      <div aria-hidden className="flex items-center gap-2">
        <TeamBadge team={away} size="sm" />
        <span className="text-base font-semibold tabular-nums text-text-primary">{away.score}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">vs</span>
        <span className="text-base font-semibold tabular-nums text-text-primary">{home.score}</span>
        <TeamBadge team={home} size="sm" />
      </div>
    </div>
  );
}
