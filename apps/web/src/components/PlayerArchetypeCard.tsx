import { Link } from "react-router-dom";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerStyleMap } from "@/components/PlayerStyleMap";
import type {
  ArchetypeMembership,
  PlayerArchetypeResponse,
  SimilarPlayer,
  StyleMapResponse,
} from "@/types/nba";

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

/**
 * One similar player, as a tile in the same locker language as StatTile:
 * sharp border, recessed ground, mono micro-label, no rounded corners.
 *
 * Unlike a stat tile, the NAME is the figure here rather than the number —
 * the similarity score is supporting detail, and a deliberately quiet one,
 * since the scores compress into a narrow band and say much less than
 * their ordering does.
 */
function SimilarPlayerTile({ entry }: { entry: SimilarPlayer }) {
  const { player } = entry;
  return (
    <li>
      <Link
        to={`/players/${player.id}`}
        className="group flex h-full flex-col items-center gap-2 border border-landing-light bg-landing-hero px-3 py-3 text-center transition hover:border-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
      >
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          {entry.rank === 1 ? "Most similar" : `#${entry.rank}`}
        </span>
        {/* Empty alt: the player's name is right there as text, and
            duplicating it makes screen readers announce it twice. */}
        <PlayerHeadshot player={player} size="md" alt="" />
        <span className="font-display text-[13px] leading-tight text-landing-ink">
          {player.firstName} {player.lastName}
        </span>
        <span className="mt-auto flex items-center gap-2 pt-1">
          {player.team && <TeamBadge team={player.team} size="sm" />}
          <span className="font-display text-[15px] tabular-nums text-locker-ink-muted">
            {Math.round(entry.similarityScore)}
          </span>
        </span>
        {/* The whole tile is the link, but nothing said so; the cue names
            the destination and lights up with the hover border tint. */}
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase transition-colors group-hover:text-locker-leather">
          View profile <span aria-hidden>→</span>
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
export function PlayerArchetypeCard({
  data,
  styleMap,
  listedPosition,
}: {
  data: PlayerArchetypeResponse;
  // The player's listed position, shown beside the archetype rather than
  // used to produce it. Position is NOT a feature of the model — height
  // and weight are — so a third of the league lands in an archetype whose
  // name does not match the slot they are listed in. Showing the listed
  // position makes that visible and deliberate instead of looking like a
  // mistake, and the section's info panel says why.
  listedPosition?: string;
  // Optional: the card is complete without it. The map is supplementary to
  // the bars and tiles rather than a third source of information, so it
  // simply does not render while it is loading or if it fails.
  styleMap?: StyleMapResponse;
}) {
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
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h3 className="mb-2 text-[11px] tracking-[0.18em] text-locker-ink-muted uppercase">
            Playing style · {data.season}
          </h3>
          <p className="mb-3 text-[12.5px] text-locker-ink-muted">
            {listedPosition && <>Listed {listedPosition}. </>}
            {archetypes.length > 1
              ? "Sits between archetypes — closest first."
              : "Sits clearly inside one archetype."}
          </p>
          <ArchetypeBars archetypes={archetypes} />
        </div>

        {styleMap && styleMap.players.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] tracking-[0.18em] text-locker-ink-muted uppercase">
              Style map
            </h3>
            <p className="mb-1 text-[12.5px] text-locker-ink-muted">
              Every player with enough minutes, placed by how they play. Near means alike.
            </p>
            <PlayerStyleMap
              points={styleMap.players}
              subjectPlayerId={data.playerId}
              subjectClusterId={archetypes[0].clusterId}
              subjectArchetypeLabel={archetypes[0].label}
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[11px] tracking-[0.18em] text-locker-ink-muted uppercase">
          Similar players
        </h3>
        <p className="mb-3 text-[12.5px] text-locker-ink-muted">
          Closest in playing style, not in quality.
        </p>
        {similarPlayers.length === 0 ? (
          <p className="text-[12.5px] text-locker-ink-muted">No similar players for this season.</p>
        ) : (
          // Two across on a phone, five on a wide screen — the same
          // breakpoint rhythm as the stat tiles above, so the section reads
          // as part of the same page rather than as its own layout.
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {similarPlayers.map((entry) => (
              <SimilarPlayerTile key={entry.player.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
