import { useState } from "react";
import { resolveTeamColors } from "@/components/TeamBadge";
import { getPlayerHeadshotUrl } from "@/lib/nbaMedia";
import type { PredictedScorer, Team } from "@/types/nba";

interface CourtViewProps {
  homeTeam: Team;
  awayTeam: Team;
  homeScorers: PredictedScorer[];
  awayScorers: PredictedScorer[];
  selectedPlayerId?: string | null;
  onSelectPlayer?: (scorer: PredictedScorer) => void;
}

const COURT_WIDTH = 940;
const COURT_HEIGHT = 500;
const HALF_WIDTH = COURT_WIDTH / 2;
const HOOP_INSET = 60;
const KEY_WIDTH = 190;
const KEY_HEIGHT = 160;
const THREE_POINT_RADIUS = 220;
const CENTER_CIRCLE_RADIUS = 60;

// Large enough for a real headshot to read as a face, not a dot — this
// grew from the original flat-color marker's 26px once real photos
// replaced the colored-circle+initials treatment (see PlayerMarker below).
const PLAYER_MARKER_RADIUS = 34;

// A predicted starting five isn't tracked positional data — nba_api's
// roster endpoint only gives a role string (G, F, C, or a hybrid like
// "G-F"), not real court coordinates, and this is a *pregame* prediction
// anyway, not a live tracked lineup. FORMATION_SLOTS is a schematic,
// illustrative layout (guards out front, forwards mid, centers near the
// rim) — a reasonable default arrangement by role, not a claim about
// where anyone will actually stand. Hybrid positions ("G-F", "F-C") use
// their first-listed role, matching how the position string itself
// already orders itself by primary role.
type FormationSlot = "guard1" | "guard2" | "forward1" | "forward2" | "center";

const FORMATION_ORDER: FormationSlot[] = ["guard1", "guard2", "forward1", "forward2", "center"];

// Offsets from a team's own baseline, mirrored for the away team. Court
// runs 0 (home baseline) to COURT_WIDTH (away baseline) along x.
const FORMATION_OFFSETS: Record<FormationSlot, { x: number; y: number }> = {
  guard1: { x: 300, y: 110 },
  guard2: { x: 300, y: 390 },
  forward1: { x: 200, y: 160 },
  forward2: { x: 200, y: 340 },
  center: { x: 90, y: 250 },
};

function primaryRole(position: string): "G" | "F" | "C" {
  const first = position.split("-")[0];
  return first === "G" || first === "C" ? first : "F";
}

function assignFormationSlots(scorers: PredictedScorer[]): { scorer: PredictedScorer; slot: FormationSlot }[] {
  const byRole: Record<"G" | "F" | "C", PredictedScorer[]> = { G: [], F: [], C: [] };
  for (const scorer of scorers) {
    byRole[primaryRole(scorer.player.position)].push(scorer);
  }

  const ordered = [...byRole.G, ...byRole.F, ...byRole.C];
  return ordered.slice(0, FORMATION_ORDER.length).map((scorer, index) => ({
    scorer,
    slot: FORMATION_ORDER[index],
  }));
}

interface PlayerMarkerProps {
  scorer: PredictedScorer;
  x: number;
  y: number;
  colors: { primary: string; secondary: string };
  selected: boolean;
  onSelect?: (scorer: PredictedScorer) => void;
}

function PlayerMarker({ scorer, x, y, colors, selected, onSelect }: PlayerMarkerProps) {
  // Same fallback contract as PlayerHeadshot.tsx: not every player has a
  // real headshot at this id (two-way/G-League call-ups, very recent
  // draftees), so a failed <image> load falls back to the same colored-
  // circle-plus-initials treatment this replaced, rather than a broken-
  // image icon or empty circle. SVG's <image> fires a real "error" event
  // (unlike a CSS background-image), so this is the same onError-driven
  // pattern as the HTML <img> version, just on the SVG element.
  const [photoFailed, setPhotoFailed] = useState(false);
  const initials = `${scorer.player.firstName[0]}${scorer.player.lastName[0]}`;
  const clipId = `court-headshot-clip-${scorer.player.id}`;
  const fullName = `${scorer.player.firstName} ${scorer.player.lastName}`;
  // A thin ink-colored ring on select, same weight as the rest of the
  // court's linework — the earlier thick leather-orange ring read as a
  // harsh block dropped onto the court rather than a selection state.
  const ringColor = selected ? "var(--color-text-primary)" : "rgba(0,0,0,0.35)";
  const ringWidth = selected ? 3 : 2;

  return (
    <g
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `Show ${fullName}'s predicted stats` : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect ? () => onSelect(scorer) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(scorer);
              }
            }
          : undefined
      }
      style={onSelect ? { cursor: "pointer" } : undefined}
    >
      <circle cx={x} cy={y} r={PLAYER_MARKER_RADIUS} fill={colors.primary} stroke={ringColor} strokeWidth={ringWidth} />
      {!photoFailed ? (
        <>
          <clipPath id={clipId}>
            <circle cx={x} cy={y} r={PLAYER_MARKER_RADIUS} />
          </clipPath>
          <image
            href={getPlayerHeadshotUrl(scorer.player.nbaPlayerId)}
            x={x - PLAYER_MARKER_RADIUS}
            y={y - PLAYER_MARKER_RADIUS}
            width={PLAYER_MARKER_RADIUS * 2}
            height={PLAYER_MARKER_RADIUS * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onError={() => setPhotoFailed(true)}
          />
          <circle cx={x} cy={y} r={PLAYER_MARKER_RADIUS} fill="none" stroke={ringColor} strokeWidth={ringWidth} />
        </>
      ) : (
        <text
          x={x}
          y={y + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={colors.secondary}
          fontSize={15}
          fontWeight={700}
        >
          {initials}
        </text>
      )}
      <text x={x} y={y + PLAYER_MARKER_RADIUS + 16} textAnchor="middle" fill="var(--color-text-secondary)" fontSize={12}>
        {scorer.player.lastName}
      </text>
      <text
        x={x}
        y={y + PLAYER_MARKER_RADIUS + 32}
        textAnchor="middle"
        fill="var(--color-text-muted)"
        fontSize={11}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {scorer.predictedPoints} pts
      </text>
    </g>
  );
}

export function CourtView({
  homeTeam,
  awayTeam,
  homeScorers,
  awayScorers,
  selectedPlayerId = null,
  onSelectPlayer,
}: CourtViewProps) {
  const homeColors = resolveTeamColors(homeTeam.abbreviation);
  const awayColors = resolveTeamColors(awayTeam.abbreviation);

  const homePlacements = assignFormationSlots(homeScorers);
  const awayPlacements = assignFormationSlots(awayScorers);

  return (
    <svg
      viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`}
      role="img"
      aria-label={`Predicted starting five formation for ${homeTeam.name} and ${awayTeam.name}, arranged by position — illustrative, not tracked positioning`}
      className="h-auto w-full"
    >
      <rect x={0} y={0} width={COURT_WIDTH} height={COURT_HEIGHT} fill="var(--color-surface-raised)" />

      {/* Center line + circle */}
      <line x1={HALF_WIDTH} y1={0} x2={HALF_WIDTH} y2={COURT_HEIGHT} stroke="var(--color-border-subtle)" strokeWidth={2} />
      <circle
        cx={HALF_WIDTH}
        cy={COURT_HEIGHT / 2}
        r={CENTER_CIRCLE_RADIUS}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />

      {/* Outer boundary — square corners, not rounded: the rest of the app's
          panels (locker-surface cards, the hero band, etc.) are all
          rounded-none, so a rounded court read as the one thing on the page
          that didn't match. */}
      <rect
        x={4}
        y={4}
        width={COURT_WIDTH - 8}
        height={COURT_HEIGHT - 8}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />

      {/* Home side (left) key + arc + hoop */}
      <rect
        x={0}
        y={(COURT_HEIGHT - KEY_HEIGHT) / 2}
        width={KEY_WIDTH}
        height={KEY_HEIGHT}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />
      <path
        d={`M ${HOOP_INSET} ${COURT_HEIGHT / 2 - THREE_POINT_RADIUS} A ${THREE_POINT_RADIUS} ${THREE_POINT_RADIUS} 0 0 1 ${HOOP_INSET} ${COURT_HEIGHT / 2 + THREE_POINT_RADIUS}`}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />
      <circle cx={HOOP_INSET} cy={COURT_HEIGHT / 2} r={8} fill="none" stroke="var(--color-border-subtle)" strokeWidth={2} />

      {/* Away side (right) key + arc + hoop, mirrored */}
      <rect
        x={COURT_WIDTH - KEY_WIDTH}
        y={(COURT_HEIGHT - KEY_HEIGHT) / 2}
        width={KEY_WIDTH}
        height={KEY_HEIGHT}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />
      <path
        d={`M ${COURT_WIDTH - HOOP_INSET} ${COURT_HEIGHT / 2 - THREE_POINT_RADIUS} A ${THREE_POINT_RADIUS} ${THREE_POINT_RADIUS} 0 0 0 ${COURT_WIDTH - HOOP_INSET} ${COURT_HEIGHT / 2 + THREE_POINT_RADIUS}`}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />
      <circle
        cx={COURT_WIDTH - HOOP_INSET}
        cy={COURT_HEIGHT / 2}
        r={8}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={2}
      />

      {homePlacements.map(({ scorer, slot }) => {
        const offset = FORMATION_OFFSETS[slot];
        return (
          <PlayerMarker
            key={scorer.player.id}
            scorer={scorer}
            x={offset.x}
            y={offset.y}
            colors={homeColors}
            selected={scorer.player.id === selectedPlayerId}
            onSelect={onSelectPlayer}
          />
        );
      })}
      {awayPlacements.map(({ scorer, slot }) => {
        const offset = FORMATION_OFFSETS[slot];
        return (
          <PlayerMarker
            key={scorer.player.id}
            scorer={scorer}
            x={COURT_WIDTH - offset.x}
            y={offset.y}
            colors={awayColors}
            selected={scorer.player.id === selectedPlayerId}
            onSelect={onSelectPlayer}
          />
        );
      })}
    </svg>
  );
}
