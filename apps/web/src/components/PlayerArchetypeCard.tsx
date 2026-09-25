import { Link } from "react-router-dom";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import type { ArchetypeMembership, PlayerArchetypeResponse, SimilarPlayer } from "@/types/nba";

// Opacity per rank, so the primary archetype reads as the headline and the
// rest as supporting detail. Deliberately NOT a colour per archetype: the
// labels change as the model is re-fit, and a palette keyed on them would
// silently re-colour half the league on a re-name.
const RANK_BAR_OPACITY = [1, 0.55, 0.3];

/**
 * Renders how strongly a player belongs to each of their archetypes.
 *
 * The weights are an ORDERING with a sense of proportion, not confidences,
 * so they are drawn as bars and rounded to whole percents. Showing "43.2%"
 * would claim a precision the model does not have — the clusters it comes
 * from score around 0.14 on silhouette, meaning they are boundaries
 * through a continuum rather than separate groups.
 */
function ArchetypeBars({ archetypes }: { archetypes: ArchetypeMembership[] }) {
  const strongestWeight = archetypes[0]?.weight ?? 1;

  return (
    <ul className="space-y-2.5">
      {archetypes.map((archetype, index) => (
        <li key={archetype.clusterId}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span
              className={
                index === 0
                  ? "font-display text-sm text-locker-ink"
                  : "text-[12.5px] text-locker-ink-muted"
              }
            >
              {archetype.label}
            </span>
            <span className="text-[11px] tabular-nums text-locker-ink-muted">
              {Math.round(archetype.weight * 100)}%
            </span>
          </div>
          {/* Bars are scaled against the strongest rather than against 100%,
              so a player spread thinly across archetypes still produces a
              readable chart instead of three slivers. */}
          <div className="h-1.5 w-full bg-landing-light" aria-hidden>
            <div
              className="h-full bg-locker-leather"
              style={{
                width: `${Math.max(4, (archetype.weight / strongestWeight) * 100)}%`,
                opacity: RANK_BAR_OPACITY[index] ?? 0.3,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SimilarPlayerRow({ entry }: { entry: SimilarPlayer }) {
  const { player } = entry;
  return (
    <li>
      <Link
        to={`/players/${player.id}`}
        className="flex items-center gap-3 border border-transparent px-2 py-2 transition hover:border-landing-light hover:bg-landing-light/30"
      >
        {/* Empty alt: the player's name is right there as text, and
            duplicating it makes screen readers announce it twice. */}
        <PlayerHeadshot player={player} size="sm" alt="" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-locker-ink">
          {player.firstName} {player.lastName}
        </span>
        {player.team && <TeamBadge team={player.team} size="sm" />}
        <span className="w-10 text-right text-[11px] tabular-nums text-locker-ink-muted">
          {Math.round(entry.similarityScore)}
        </span>
      </Link>
    </li>
  );
}

/**
 * The "Style & similar players" card on the player profile.
 *
 * Handles three states that are all normal, not just the happy path:
 *   - a player with archetypes and neighbours,
 *   - a player the model deliberately did not place, because their minutes
 *     are too few for rate stats to describe a style rather than a small
 *     sample,
 *   - a deployment where no season has been fitted at all.
 * The middle one is the common case for deep-bench players and has to read
 * as an explanation rather than as an error.
 */
export function PlayerArchetypeCard({ data }: { data: PlayerArchetypeResponse }) {
  if (!data.season) {
    return (
      <p className="text-[12.5px] text-locker-ink-muted">
        No season has been analysed for playing style yet.
      </p>
    );
  }

  if (!data.archetype || data.archetype.archetypes.length === 0) {
    return (
      <p className="text-[12.5px] text-locker-ink-muted">
        Not enough minutes in {data.season} to describe this player's style. Rate stats over a
        handful of games measure the sample, not the player, so no archetype is assigned rather
        than a misleading one.
      </p>
    );
  }

  const { archetypes, similarPlayers } = data.archetype;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[11px] tracking-[0.18em] text-locker-ink-muted uppercase">
          Playing style · {data.season}
        </h3>
        <p className="mb-3 text-[12.5px] text-locker-ink-muted">
          {archetypes.length > 1
            ? "Most players sit between archetypes rather than inside one — these are the closest, strongest first."
            : "This player sits clearly inside one archetype."}
        </p>
        <ArchetypeBars archetypes={archetypes} />
      </div>

      <div>
        <h3 className="mb-2 text-[11px] tracking-[0.18em] text-locker-ink-muted uppercase">
          Similar players
        </h3>
        <p className="mb-3 text-[12.5px] text-locker-ink-muted">
          Closest in playing style, not in quality — a high score means they play alike, never that
          they are equally good.
        </p>
        {similarPlayers.length === 0 ? (
          <p className="text-[12.5px] text-locker-ink-muted">No similar players for this season.</p>
        ) : (
          <ul className="-mx-2">
            {similarPlayers.map((entry) => (
              <SimilarPlayerRow key={entry.player.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
