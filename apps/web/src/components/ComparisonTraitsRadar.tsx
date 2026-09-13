import { useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import {
  TRAIT_CEILINGS,
  TRAIT_LABELS,
  TRAIT_STAT_LINES,
  TRAITS_IN_ORDER,
  clampToPercent,
  formatTraitStatLine,
  traitInputsFor,
  type TraitKey,
} from "./PlayerTraitsRadar";
import { COMPARISON_PLAYER_COLORS } from "@/lib/comparisonColors";
import type { PlayerComparisonEntry } from "@/types/nba";

interface ComparisonTraitsRadarProps {
  entries: PlayerComparisonEntry[];
}

// Two overlapping filled polygons read fine — a third stacked on top starts
// hiding whichever player is underneath, so beyond two players the radar
// gives up on overlay and falls back to one small chart per player instead
// (see the small-multiples branch below).
const MAX_OVERLAY_PLAYERS = 2;

const SERIES_COLORS = COMPARISON_PLAYER_COLORS;

function playerLabel(entry: PlayerComparisonEntry): string {
  return `${entry.player.firstName} ${entry.player.lastName}`;
}

// One row per trait, each carrying every entry's normalised value under its
// own key (p0, p1, ...) — the shape recharts' multi-series RadarChart wants:
// one data array shared by every <Radar>, one dataKey per series.
function buildOverlayData(entries: PlayerComparisonEntry[]) {
  return TRAITS_IN_ORDER.map((trait) => {
    const row: Record<string, string | number> = { trait };
    entries.forEach((entry, index) => {
      const inputs = traitInputsFor(entry.seasonAverages);
      row[`p${index}`] = clampToPercent(inputs[trait], TRAIT_CEILINGS[trait]);
    });
    return row;
  });
}

interface TraitAxisLabelProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: TraitKey };
  selectedTrait: TraitKey;
  onSelectTrait: (trait: TraitKey) => void;
  // Small multiples have less room per chart — a smaller, unbolded label
  // still needs to be legible (see the bug this replaced: tick={false} hid
  // the axis labels entirely once three or more players split the radar
  // into individual charts).
  compact?: boolean;
}

// One radar axis label, clickable like the single-player radar's own axis
// ticks: selecting a trait pins the drill-down panel below to it.
function TraitAxisLabel({ x, y, payload, selectedTrait, onSelectTrait, compact = false }: TraitAxisLabelProps) {
  const trait = payload?.value;
  if (trait === undefined || x === undefined || y === undefined) return null;
  const isSelected = trait === selectedTrait;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={`cursor-pointer tracking-[0.08em] uppercase select-none outline-none focus-visible:fill-locker-leather ${
        compact ? "text-[9px]" : "text-[11px]"
      } ${isSelected ? "fill-locker-leather font-bold" : "fill-locker-ink-muted hover:fill-locker-leather"}`}
      onClick={() => onSelectTrait(trait)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectTrait(trait);
        }
      }}
    >
      {compact ? TRAIT_LABELS[trait].slice(0, 3) : TRAIT_LABELS[trait]}
    </text>
  );
}

function Legend({ entries }: { entries: PlayerComparisonEntry[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {entries.map((entry, index) => (
        <span
          key={entry.player.id}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase"
        >
          <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ backgroundColor: SERIES_COLORS[index] }} />
          {playerLabel(entry)}
        </span>
      ))}
    </div>
  );
}

function OverlayRadar({
  entries,
  selectedTrait,
  onSelectTrait,
}: {
  entries: PlayerComparisonEntry[];
  selectedTrait: TraitKey;
  onSelectTrait: (trait: TraitKey) => void;
}) {
  const data = buildOverlayData(entries);
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={data} outerRadius="65%">
          <PolarGrid stroke="var(--color-landing-light)" />
          <PolarAngleAxis
            dataKey="trait"
            tick={(props) => <TraitAxisLabel {...props} selectedTrait={selectedTrait} onSelectTrait={onSelectTrait} />}
          />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          {entries.map((entry, index) => (
            <Radar
              key={entry.player.id}
              dataKey={`p${index}`}
              stroke={SERIES_COLORS[index]}
              fill={SERIES_COLORS[index]}
              fillOpacity={0.3}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
      <Legend entries={entries} />
    </div>
  );
}

// One player, one small chart — used for 3-4 players, where an overlay of
// that many translucent polygons stops being readable (see MAX_OVERLAY_PLAYERS).
// Each chart keeps its own compact, clickable trait labels (fixed in this
// component: they used to be tick={false} and invisible) rather than
// sharing one shared axis, since the small multiples are laid out as
// separate charts, not one shared polar plot.
function SmallMultipleRadar({
  entry,
  color,
  selectedTrait,
  onSelectTrait,
}: {
  entry: PlayerComparisonEntry;
  color: string;
  selectedTrait: TraitKey;
  onSelectTrait: (trait: TraitKey) => void;
}) {
  const inputs = traitInputsFor(entry.seasonAverages);
  const data = TRAITS_IN_ORDER.map((trait) => ({ trait, value: clampToPercent(inputs[trait], TRAIT_CEILINGS[trait]) }));

  return (
    <div className="p-2">
      <p className="mb-1 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        <span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />
        {playerLabel(entry)}
      </p>
      <ResponsiveContainer width="100%" height={150}>
        <RadarChart data={data} outerRadius="60%">
          <PolarGrid stroke="var(--color-landing-light)" />
          <PolarAngleAxis
            dataKey="trait"
            tick={(props) => <TraitAxisLabel {...props} selectedTrait={selectedTrait} onSelectTrait={onSelectTrait} compact />}
          />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Drill-down for the selected trait: every selected player's raw season
// figures behind that trait's normalised shape, one column per player — the
// comparison-page equivalent of the single-player radar's own drill-down
// panel below its chart. Each stat line sits in its own bordered block (not
// just vertical whitespace) and each player's column has a divider against
// its neighbour, so the panel reads as a small table rather than a run-on
// list of numbers once there are three or four columns to tell apart.
function DrillDownPanel({ entries, selectedTrait }: { entries: PlayerComparisonEntry[]; selectedTrait: TraitKey }) {
  const statLines = TRAIT_STAT_LINES[selectedTrait];
  return (
    <div className="mt-3 border-t border-landing-light pt-3">
      <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
        {TRAIT_LABELS[selectedTrait]} · this segment
      </p>
      <div className="mt-2 divide-y divide-landing-light border border-landing-light">
        {statLines.map((line) => (
          <div key={line.label} className="p-2.5">
            <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{line.label}</span>
            <div className="mt-1.5 grid divide-x divide-landing-light" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }}>
              {entries.map((entry, index) => (
                <div key={entry.player.id} className="px-1.5 text-center first:pl-0 last:pr-0">
                  <div className="font-display text-sm tabular-nums" style={{ color: SERIES_COLORS[index] }}>
                    {formatTraitStatLine(line, entry.seasonAverages)}
                  </div>
                  <div className="truncate font-mono text-[8px] tracking-[0.06em] text-locker-ink-muted uppercase">
                    {playerLabel(entry)}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px] leading-snug text-locker-ink-muted">{line.explain}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Trait radar for the compare page: up to two players overlay as filled
// polygons on one chart with a legend; three or four fall back to one small
// chart each, since more than two overlapping fills stop being legible —
// see MAX_OVERLAY_PLAYERS. Clicking any trait axis (on the overlay or on any
// one of the small multiples) pins the drill-down panel to that trait for
// every selected player.
export function ComparisonTraitsRadar({ entries }: ComparisonTraitsRadarProps) {
  const [selectedTrait, setSelectedTrait] = useState<TraitKey>("scoring");

  if (entries.length === 0) return null;

  return (
    <div>
      {entries.length <= MAX_OVERLAY_PLAYERS ? (
        <OverlayRadar entries={entries} selectedTrait={selectedTrait} onSelectTrait={setSelectedTrait} />
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-y divide-landing-light border border-landing-light">
            {entries.map((entry, index) => (
              <SmallMultipleRadar
                key={entry.player.id}
                entry={entry}
                color={SERIES_COLORS[index]}
                selectedTrait={selectedTrait}
                onSelectTrait={setSelectedTrait}
              />
            ))}
          </div>
          <Legend entries={entries} />
        </>
      )}
      <DrillDownPanel entries={entries} selectedTrait={selectedTrait} />
    </div>
  );
}
