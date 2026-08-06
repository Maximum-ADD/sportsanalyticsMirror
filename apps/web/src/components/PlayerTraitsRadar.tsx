import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { SeasonAverages } from "../types/nba";

interface PlayerTraitsRadarProps {
  seasonAverages: SeasonAverages;
}

// Normalises raw per-game figures onto a 0-100 scale so wildly different
// units (points vs. blocks) can share one radar chart, matching the
// "stat traits" panel from the reference dashboard.
function buildTraitData(seasonAverages: SeasonAverages) {
  const traitCeilings = {
    scoring: 35,
    rebounding: 15,
    playmaking: 12,
    defense: 4,
    efficiency: 65,
  };

  return [
    { trait: "Scoring", value: clampToPercent(seasonAverages.pointsPerGame, traitCeilings.scoring) },
    { trait: "Rebounding", value: clampToPercent(seasonAverages.reboundsPerGame, traitCeilings.rebounding) },
    { trait: "Playmaking", value: clampToPercent(seasonAverages.assistsPerGame, traitCeilings.playmaking) },
    {
      trait: "Defense",
      value: clampToPercent(seasonAverages.stealsPerGame + seasonAverages.blocksPerGame, traitCeilings.defense),
    },
    { trait: "Efficiency", value: clampToPercent(seasonAverages.fieldGoalPercentage, traitCeilings.efficiency) },
  ];
}

function clampToPercent(value: number, ceiling: number): number {
  return Math.min(100, Math.round((value / ceiling) * 100));
}

export function PlayerTraitsRadar({ seasonAverages }: PlayerTraitsRadarProps) {
  const traitData = buildTraitData(seasonAverages);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={traitData} outerRadius="65%">
        <PolarGrid stroke="var(--color-border-subtle)" />
        <PolarAngleAxis dataKey="trait" tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }} />
        <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
        <Radar
          dataKey="value"
          stroke="var(--color-brand-accent)"
          fill="var(--color-brand-accent)"
          fillOpacity={0.35}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
