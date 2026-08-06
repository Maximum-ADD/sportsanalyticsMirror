import { cn } from "@/lib/utils";
import type { Team } from "@/types/nba";

interface TeamColors {
  primary: string;
  secondary: string;
}

// Real primary/secondary colors for the teams in the current mock dataset —
// authentic rather than generic. Any team not listed here (i.e. everything
// pending the real nba_api ingestion pipeline) still gets a distinct,
// consistent color via a hash of its abbreviation, so this never falls back
// to a single flat placeholder color as the roster grows.
const KNOWN_TEAM_COLORS: Record<string, TeamColors> = {
  LAL: { primary: "#552583", secondary: "#FDB927" },
  BOS: { primary: "#007A33", secondary: "#BA9653" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6" },
};

const HUE_WHEEL_DEGREES = 360;
const FALLBACK_SATURATION_PERCENT = 55;
const FALLBACK_LIGHTNESS_PERCENT = 32;

// djb2-style string hash, used only to pick a stable hue — collisions
// between two team abbreviations are a cosmetic non-issue, not a bug.
function hashToHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
  }
  return Math.abs(hash) % HUE_WHEEL_DEGREES;
}

function resolveTeamColors(abbreviation: string): TeamColors {
  const known = KNOWN_TEAM_COLORS[abbreviation];
  if (known) return known;

  const hue = hashToHue(abbreviation);
  return {
    primary: `hsl(${hue} ${FALLBACK_SATURATION_PERCENT}% ${FALLBACK_LIGHTNESS_PERCENT}%)`,
    secondary: "var(--color-text-primary)",
  };
}

interface TeamBadgeProps {
  team: Pick<Team, "abbreviation">;
  size?: "sm" | "md";
  className?: string;
}

export function TeamBadge({ team, size = "md", className }: TeamBadgeProps) {
  const { primary, secondary } = resolveTeamColors(team.abbreviation);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        size === "sm" ? "size-6 text-[10px]" : "size-10 text-xs",
        className
      )}
      style={{ backgroundColor: primary, color: secondary }}
    >
      {team.abbreviation}
    </span>
  );
}
