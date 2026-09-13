import { useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { SeasonAverages } from "@/types/nba";

interface PlayerTraitsRadarProps {
  seasonAverages: SeasonAverages;
}

// The five traits the radar plots. Each axis label in the chart is a
// button: clicking one pins the trait and shows the raw season figures
// behind its normalised shape in the panel below — a 78 "Scoring" pentagon
// is a lot more meaningful next to "32.1 PTS/G on 19.4 FGA/G".
// Exported for ComparisonTraitsRadar, which plots the same five traits for
// more than one player and needs the identical key set and ordering.
export type TraitKey = "scoring" | "rebounding" | "playmaking" | "defense" | "efficiency";

export const TRAIT_LABELS: Record<TraitKey, string> = {
  scoring: "Scoring",
  rebounding: "Rebounding",
  playmaking: "Playmaking",
  defense: "Defense",
  efficiency: "Efficiency",
};

// Display order around the pentagon — production first, then role, then
// efficiency, matching the profile page's top-to-bottom reading order.
export const TRAITS_IN_ORDER: readonly TraitKey[] = ["scoring", "rebounding", "playmaking", "defense", "efficiency"];

// Exported for ComparisonTraitsRadar's drill-down panel, which shows the
// same per-trait stat lines but one column per selected player instead of
// one player's figures alone.
export interface TraitStatLine {
  label: string;
  // null when the season line has no recorded figure — renders as "—",
  // same convention as the stat tiles.
  selectValue: (averages: SeasonAverages) => number | null;
  format: (value: number) => string;
  // Plain-terms gloss under the figure: what the abbreviation measures
  // and why it matters. The labels are stat-headline jargon; this is the
  // sentence a casual fan reads them for.
  explain: string;
}

// Per-game rates take one decimal place; shooting figures in
// SeasonAverages are already percentages (52 means 52%), so they only need
// the "%" suffix.
const formatPerGameRate: TraitStatLine["format"] = (value) => value.toFixed(1);
const formatPercentageFigure: TraitStatLine["format"] = (value) => `${value.toFixed(1)}%`;

const TS_EXPLAIN =
  "True shooting percentage. Scoring efficiency that counts threes and free throws, so volume chuckers and efficient scorers are not lumped together.";

// What the panel shows per trait: the exact inputs the radar normalises,
// plus the context figures that make those inputs meaningful. Declared as
// data, not markup, so adding a trait means one entry here.
export const TRAIT_STAT_LINES: Record<TraitKey, TraitStatLine[]> = {
  scoring: [
    {
      label: "PTS/G",
      selectValue: (averages) => averages.pointsPerGame,
      format: formatPerGameRate,
      explain: "Points per game. The headline scoring output — simply how many points they average a night.",
    },
    {
      label: "FGA/G",
      selectValue: (averages) => averages.fieldGoalsAttemptedPerGame,
      format: formatPerGameRate,
      explain: "Field goal attempts per game — how many shots they take. Volume is half of what fills the scoring column.",
    },
    {
      label: "FTA/G",
      selectValue: (averages) => averages.freeThrowsAttemptedPerGame,
      format: formatPerGameRate,
      explain: "Free throw attempts per game — how often they get to the line, a sign of how hard they attack the defence.",
    },
    { label: "TS%", selectValue: (averages) => averages.trueShootingPercentage, format: formatPercentageFigure, explain: TS_EXPLAIN },
  ],
  rebounding: [
    {
      label: "REB/G",
      selectValue: (averages) => averages.reboundsPerGame,
      format: formatPerGameRate,
      explain: "Rebounds per game — missed shots they collect. Offensive boards keep a possession alive; defensive ones end the other team's.",
    },
    {
      label: "MIN/G",
      selectValue: (averages) => averages.minutesPerGame,
      format: formatPerGameRate,
      explain: "Minutes per game — how long the coach keeps them on the floor. More court time means more chances at every counting stat.",
    },
  ],
  playmaking: [
    {
      label: "AST/G",
      selectValue: (averages) => averages.assistsPerGame,
      format: formatPerGameRate,
      explain: "Assists per game — baskets they directly set up for teammates. The raw measure of a player's passing output.",
    },
    {
      label: "AST:TO",
      selectValue: (averages) => averages.assistToTurnoverRatio,
      format: (value) => value.toFixed(2),
      explain: "Assist-to-turnover ratio. Playmaking weighed against mistakes — above 2.0 means they create twice as often as they cough it up.",
    },
    {
      label: "TOV/G",
      selectValue: (averages) => averages.turnoversPerGame,
      format: formatPerGameRate,
      explain: "Turnovers per game — possessions handed to the other team. Lower is better, especially for primary ball-handlers.",
    },
  ],
  defense: [
    {
      label: "STL/G",
      selectValue: (averages) => averages.stealsPerGame,
      format: formatPerGameRate,
      explain: "Steals per game — how often they take the ball off the opponent. One of the two headline defensive plays.",
    },
    {
      label: "BLK/G",
      selectValue: (averages) => averages.blocksPerGame,
      format: formatPerGameRate,
      explain: "Blocks per game — shots they swat away. The rim-protection number that makes drivers think twice.",
    },
    {
      label: "STL+BLK/G",
      selectValue: (averages) => averages.stealsPerGame + averages.blocksPerGame,
      format: formatPerGameRate,
      explain: "Steals plus blocks per game — 'stocks'. The all-in-one tally of how much a player disrupts the other team.",
    },
  ],
  efficiency: [
    {
      label: "FG%",
      selectValue: (averages) => averages.fieldGoalPercentage,
      format: formatPercentageFigure,
      explain: "Field goal percentage — how many of their shots go in, wherever they are taken from. Raw accuracy.",
    },
    {
      label: "3P%",
      selectValue: (averages) => averages.threePointPercentage,
      format: formatPercentageFigure,
      explain: "Three-point percentage — accuracy from beyond the arc. A high number forces defences to stretch out and guard them tightly.",
    },
    {
      label: "FT%",
      selectValue: (averages) => averages.freeThrowPercentage,
      format: formatPercentageFigure,
      explain: "Free throw percentage — accuracy at the line, the one shot nobody defends. Late-game fouling targets the shaky ones.",
    },
    { label: "TS%", selectValue: (averages) => averages.trueShootingPercentage, format: formatPercentageFigure, explain: TS_EXPLAIN },
  ],
};

// The ceiling each raw input is measured against — the same inputs the
// panel surfaces, kept next to each other so a trait and its display can
// never disagree about what feeds it. Exported so ComparisonTraitsRadar
// normalises every player onto the exact same 0-100 scale this component
// uses, rather than risking the two drifting apart.
export const TRAIT_CEILINGS: Record<TraitKey, number> = {
  scoring: 35,
  rebounding: 15,
  playmaking: 12,
  defense: 4,
  efficiency: 65,
};

export function traitInputsFor(seasonAverages: SeasonAverages): Record<TraitKey, number> {
  return {
    scoring: seasonAverages.pointsPerGame,
    rebounding: seasonAverages.reboundsPerGame,
    playmaking: seasonAverages.assistsPerGame,
    defense: seasonAverages.stealsPerGame + seasonAverages.blocksPerGame,
    efficiency: seasonAverages.fieldGoalPercentage,
  };
}

// Normalises raw per-game figures onto a 0-100 scale so wildly different
// units (points vs. blocks) can share one radar chart, matching the
// "stat traits" panel from the reference dashboard.
function buildTraitData(seasonAverages: SeasonAverages) {
  const traitInputs = traitInputsFor(seasonAverages);
  return TRAITS_IN_ORDER.map((trait) => ({
    trait,
    value: clampToPercent(traitInputs[trait], TRAIT_CEILINGS[trait]),
  }));
}

export function clampToPercent(value: number, ceiling: number): number {
  return Math.min(100, Math.round((value / ceiling) * 100));
}

export function formatTraitStatLine(line: TraitStatLine, averages: SeasonAverages): string {
  const value = line.selectValue(averages);
  return value === null ? "—" : line.format(value);
}

interface TraitAxisTickProps {
  // Recharts types axis coordinates as string | number even though the
  // polar layout always produces numbers.
  x?: number | string;
  y?: number | string;
  payload?: { value: TraitKey };
  selectedTrait: TraitKey;
  onSelectTrait: (trait: TraitKey) => void;
}

// One radar axis label. SVG <text> carries no button behaviour, so the
// role/tabIndex/keyboard wiring is hand-rolled: Enter and Space select the
// trait the same way a click does, and aria-pressed reports which trait
// the panel below is showing.
function TraitAxisTick({ x, y, payload, selectedTrait, onSelectTrait }: TraitAxisTickProps) {
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
      className={`cursor-pointer tracking-[0.08em] uppercase select-none text-[11px] outline-none focus-visible:fill-locker-leather ${
        isSelected ? "fill-locker-leather font-bold" : "fill-locker-ink-muted hover:fill-locker-leather"
      }`}
      onClick={() => onSelectTrait(trait)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectTrait(trait);
        }
      }}
    >
      {TRAIT_LABELS[trait]}
    </text>
  );
}

export function PlayerTraitsRadar({ seasonAverages }: PlayerTraitsRadarProps) {
  // Defaults to Scoring so the panel is never the empty box the section
  // used to be — there's always a trait's figures on display.
  const [selectedTrait, setSelectedTrait] = useState<TraitKey>("scoring");
  const traitData = buildTraitData(seasonAverages);
  const statLines = TRAIT_STAT_LINES[selectedTrait];

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={traitData} outerRadius="65%">
          <PolarGrid stroke="var(--color-landing-light)" />
          <PolarAngleAxis
            dataKey="trait"
            tick={(props) => (
              <TraitAxisTick {...props} selectedTrait={selectedTrait} onSelectTrait={setSelectedTrait} />
            )}
          />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          <Radar
            dataKey="value"
            stroke="var(--color-locker-leather)"
            fill="var(--color-locker-leather)"
            fillOpacity={0.35}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Drill-down for the selected trait: the raw season figures behind
          the normalised radar shape, each with a plain-terms gloss. Reads
          the same averages the radar does, so the local "what if" edit
          overlay moves both together. */}
      <div className="mt-2 border-t border-landing-light pt-3">
        <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          {TRAIT_LABELS[selectedTrait]} · this segment
        </p>
        <div className="mt-2 space-y-2.5">
          {statLines.map((line) => (
            <div key={line.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                  {line.label}
                </span>
                <span className="font-display text-lg text-landing-ink tabular-nums">
                  {formatTraitStatLine(line, seasonAverages)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-locker-ink-muted">{line.explain}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
