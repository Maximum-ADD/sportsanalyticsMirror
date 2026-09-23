import { cn } from "@/lib/utils";

interface ProRankBadgeProps {
  rank: number | null;
  /** Tone comes from the caller — see the note below. */
  className?: string;
}

/**
 * A prospect's standing on the Become Pro board, as "#12".
 *
 * Renders NOTHING when there is no rank. "Not yet ranked" is a real state, but
 * it is not rank zero and it is not an em dash — "#—" reads as a broken figure
 * and "#0" reads as a real (terrible) one. The places with room to explain
 * themselves say so in words instead, with the specific reason beside them
 * (see describeRankState in lib/prospectValue.ts); this badge is used where
 * there is no such room, so it simply steps aside.
 *
 * Deliberately tone-dumb: the caller passes the colour. The badge sits both in
 * the dark header bar beside the account name and on light locker surfaces,
 * and one `className` covers both without a variant prop that would have to
 * know about every surface it might appear on.
 */
export function ProRankBadge({ rank, className }: ProRankBadgeProps) {
  if (rank === null) return null;

  return (
    <span
      // The visible "#12" is glanceable but not self-describing, so the
      // accessible name says what the number actually means.
      aria-label={`Rank ${rank} on the Become Pro board`}
      className={cn("font-mono text-[10px] tracking-[0.1em] tabular-nums", className)}
    >
      #{rank}
    </span>
  );
}
