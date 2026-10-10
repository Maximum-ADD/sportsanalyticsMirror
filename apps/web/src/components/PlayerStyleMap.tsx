import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ResponsiveContainer } from "recharts";
import type { StyleMapPoint } from "@/types/nba";

// Two marks, not nine. There are nine archetypes, and giving each its own
// hue would need a nine-colour categorical palette — which no palette
// supports honestly, and which would be unreadable at this size anyway.
// The question this map answers is "where does THIS player sit", so the
// encoding is composite: their archetype is the accent, everyone else is
// recessive context, and the player themselves is a ringed marker.
//
// Validated as a categorical pair against the card surface (#e3e0dc):
// normal-vision ΔE 17.4, CVD ΔE 9.4 (protan), both above 3:1 contrast.
// The grey deliberately sits below the chroma floor and under the
// lightness band — it is not an identity competing for attention, it is
// the absence of one.
const SAME_ARCHETYPE_COLOR = "var(--color-locker-leather)";
const OTHER_PLAYERS_COLOR = "var(--color-locker-ink-muted)";
// The subject is ringed in ink rather than in the surface colour. A
// surface ring only separates them from whatever sits underneath; an ink
// ring makes them findable at a glance in a field of three hundred, and
// gives the legend swatch something to differ by other than size — which
// at legend scale was no difference at all.
const SUBJECT_RING_COLOR = "var(--color-landing-ink)";

// What the two axes mean, read off the actual component loadings rather
// than assumed. PC1 is dominated by offensive and defensive rebounds,
// height, weight and blocks, against three-point volume pulling the other
// way: it is the interior/perimeter axis. PC2 is dominated by usage,
// points, turnovers and assists: it is how much of the offence runs
// through the player. Directional labels only — the units are principal
// component scores and mean nothing as quantities, so no ticks.
//
// Both labels name BOTH ends. A single-ended label ("on-ball load →")
// leaves a reader nothing to read a position against: knowing which way
// is "more" does not say what "less" is, and a player sitting low on the
// axis then has no description at all.
const HORIZONTAL_AXIS_LABEL = "Perimeter shooting  →  size & interior play";
const VERTICAL_AXIS_LABEL = "Off-ball role  →  on-ball creation";

// Small enough that a few hundred points read as density rather than as a
// solid mass, large enough to stay visible. The subject is drawn far
// bigger, because finding them is the whole job.
const CONTEXT_POINT_SIZE = 18;
const SUBJECT_POINT_SIZE = 230;

interface PlayerStyleMapProps {
  points: StyleMapPoint[];
  subjectPlayerId: string;
  subjectClusterId: number;
  subjectArchetypeLabel: string;
}

function StyleMapTooltip({ active, payload }: { active?: boolean; payload?: { payload: StyleMapPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="border border-landing-light bg-locker-surface px-2 py-1 text-[11px] text-locker-ink">
      {point.firstName} {point.lastName}
    </div>
  );
}

/**
 * Where a player sits in the league's style space.
 *
 * The axes are the first two principal components of the standardized
 * feature matrix — they carry about 56% of the variation between players,
 * and their units mean nothing on their own, so they are drawn without
 * ticks. The map is for reading POSITION and NEIGHBOURHOOD, not values,
 * which is why there is no numeric scale to misread.
 *
 * Supplementary by design: everything it shows is also stated in words by
 * the archetype bars and the similar-player tiles beside it, so a reader
 * who cannot use a scatter plot loses nothing. That is what lets it skip a
 * table view of its own.
 */
export function PlayerStyleMap({
  points,
  subjectPlayerId,
  subjectClusterId,
  subjectArchetypeLabel,
}: PlayerStyleMapProps) {
  const subject = points.filter((point) => point.playerId === subjectPlayerId);
  const sameArchetype = points.filter(
    (point) => point.clusterId === subjectClusterId && point.playerId !== subjectPlayerId
  );
  const others = points.filter((point) => point.clusterId !== subjectClusterId);

  return (
    <div>
      <div className="h-[330px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 24, left: 30 }}>
            <CartesianGrid stroke="var(--color-landing-light)" strokeOpacity={0.4} />
            {/* The component values are not quantities anyone should read,
                so the ticks are hidden rather than shown and ignored. */}
            <XAxis
              type="number"
              dataKey="plotX"
              tick={false}
              axisLine={false}
              label={{
                value: HORIZONTAL_AXIS_LABEL,
                position: "insideBottom",
                offset: -4,
                fill: "var(--color-locker-ink-muted)",
                fontSize: 12,
                letterSpacing: "0.06em",
              }}
            />
            <YAxis
              type="number"
              dataKey="plotY"
              tick={false}
              axisLine={false}
              label={{
                value: VERTICAL_AXIS_LABEL,
                angle: -90,
                position: "insideLeft",
                // Rotated SVG text is laid out along a transformed
                // baseline, so the browser's hinting works against it and
                // the glyphs come out thin and tightly packed. Extra size
                // and positive tracking are what make it readable; the
                // horizontal label carries the same so the pair match.
                style: { textAnchor: "middle", letterSpacing: "0.08em" },
                fill: "var(--color-locker-ink-muted)",
                fontSize: 12,
              }}
            />
            {/* Two size scales. Recharts sizes every series from a shared
                ZAxis unless they are given separate ids, so without this
                the subject would be drawn at context size and be no easier
                to find than anyone else. */}
            <ZAxis zAxisId="context" range={[CONTEXT_POINT_SIZE, CONTEXT_POINT_SIZE]} />
            <ZAxis zAxisId="subject" range={[SUBJECT_POINT_SIZE, SUBJECT_POINT_SIZE]} />
            <Tooltip content={<StyleMapTooltip />} cursor={false} />
            <Scatter
              data={others}
              zAxisId="context"
              fill={OTHER_PLAYERS_COLOR}
              fillOpacity={0.45}
              isAnimationActive={false}
            />
            <Scatter
              data={sameArchetype}
              zAxisId="context"
              fill={SAME_ARCHETYPE_COLOR}
              fillOpacity={0.8}
              isAnimationActive={false}
            />
            {/* Drawn last so it sits above the field, ringed in ink and
                several times larger: in a cluster of three hundred, "find
                yourself" has to be instant rather than a search. */}
            <Scatter
              data={subject}
              zAxisId="subject"
              fill={SAME_ARCHETYPE_COLOR}
              stroke={SUBJECT_RING_COLOR}
              strokeWidth={2}
              shape="circle"
              isAnimationActive={false}
              legendType="none"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Identity is never colour alone: the legend names each mark, and
          the same facts appear in the bars and tiles beside this chart. */}
      <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-locker-ink-muted">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-3 rounded-full border-2"
            style={{ backgroundColor: SAME_ARCHETYPE_COLOR, borderColor: SUBJECT_RING_COLOR }}
          />
          This player
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full opacity-75"
            style={{ backgroundColor: SAME_ARCHETYPE_COLOR }}
          />
          {subjectArchetypeLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full opacity-45"
            style={{ backgroundColor: OTHER_PLAYERS_COLOR }}
          />
          Everyone else
        </li>
      </ul>
    </div>
  );
}
