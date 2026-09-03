import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchPlayer, fetchPlayerStats } from "@/lib/nbaApi";
import { StatTile } from "@/components/StatTile";
import { PlayerTraitsRadar } from "@/components/PlayerTraitsRadar";
import { PointsTrendChart, type GamePointsDatum } from "@/components/PointsTrendChart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import type { Player, PlayerStatsResponse, SeasonAverages } from "@/types/nba";

function formatHeight(heightInches: number | null): string {
  if (heightInches === null) return "—";
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

function formatWeight(weightLbs: number | null): string {
  if (weightLbs === null) return "—";
  return `${weightLbs} lbs`;
}

function formatBirthdate(birthDate: string | null): string {
  if (!birthDate) return "—";
  return new Date(birthDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Age isn't stored anywhere - CommonPlayerInfo doesn't provide it directly,
// and it would go stale the moment it was saved (unlike birthDate, which
// never changes). Computed fresh on every render from birthDate instead.
function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// DRAFT_YEAR/DRAFT_ROUND/DRAFT_NUMBER are all-or-nothing from
// CommonPlayerInfo (an undrafted player has none of the three, never a
// partial combination) - see player_bios.py's _parse_draft_field.
function formatDraft(player: Player): string {
  if (player.draftYear === null) return "Undrafted";
  return `${player.draftYear} · Round ${player.draftRound} · Pick ${player.draftNumber}`;
}

function formatSchoolCountry(player: Player): string {
  const schoolOrAffiliation = player.school ?? player.lastAffiliation;
  if (!schoolOrAffiliation) return "—";
  return player.country ? `${schoolOrAffiliation} (${player.country})` : schoolOrAffiliation;
}

// Every player CommonPlayerInfo returns carries a BIRTHDATE, so a null
// birthDate means this player hasn't been through the bio ingestion phase
// yet (player_bios.py) - not that the data is genuinely absent. Without
// this distinction an un-enriched player wrongly renders as "Undrafted"
// and an empty birthdate, when the truth is the bio is still being loaded.
function isBioLoaded(player: Player): boolean {
  return player.birthDate !== null;
}

function toTrendData(gameLog: PlayerStatsResponse["gameLog"]): GamePointsDatum[] {
  return gameLog.map((entry, index) => ({
    gameLabel: `G${index + 1}`,
    points: entry.points,
  }));
}

// Mirrors StatTile's card styling so the Bio section reads as part of the
// same page, but sizes its value for prose (dates, schools) rather than the
// large numerals StatTile uses. When `isPending` is set the field shows a
// muted "Loading…" instead of a real value or a misleading "—".
function BioField({
  label,
  value,
  isPending = false,
}: {
  label: string;
  value: string;
  isPending?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={`mt-1 text-sm font-medium ${isPending ? "text-text-muted" : "text-text-primary"}`}
      >
        {isPending ? "Loading…" : value}
      </div>
    </div>
  );
}

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();

  const playerQuery = useQuery({
    queryKey: ["player", playerId],
    queryFn: () => fetchPlayer(playerId!),
    enabled: !!playerId,
  });

  const statsQuery = useQuery({
    queryKey: ["playerStats", playerId],
    queryFn: () => fetchPlayerStats(playerId!),
    enabled: !!playerId,
  });

  // A local, never-persisted "what if" overlay on top of the real season
  // averages — lets a visitor try out different numbers and watch the stat
  // tiles/radar react, without touching the server or surviving a refresh.
  const [isEditingStats, setIsEditingStats] = useState(false);
  const [statOverrides, setStatOverrides] = useState<Partial<SeasonAverages>>({});

  useEffect(() => {
    setIsEditingStats(false);
    setStatOverrides({});
  }, [playerId]);

  function setStatOverride(field: keyof SeasonAverages, value: number) {
    setStatOverrides((previous) => ({ ...previous, [field]: value }));
  }

  if (playerQuery.isError || statsQuery.isError) {
    return (
      <ErrorState
        message="Could not load player data."
        onRetry={() => {
          playerQuery.refetch();
          statsQuery.refetch();
        }}
      />
    );
  }

  if (playerQuery.isPending || statsQuery.isPending) {
    return (
      <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
        <Skeleton className="h-64 xl:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const player = playerQuery.data;
  const { seasonAverages, gameLog } = statsQuery.data;
  const effectiveAverages: SeasonAverages = { ...seasonAverages, ...statOverrides };
  const hasStatOverrides = Object.keys(statOverrides).length > 0;
  const age = calculateAge(player.birthDate);
  const bioPending = !isBioLoaded(player);

  return (
    <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <PlayerHeadshot player={player} size="lg" />
            <div>
              <h1 className="text-xl font-semibold text-text-primary">
                {player.firstName} {player.lastName}
              </h1>
              <p className="flex items-center gap-2 text-sm text-text-secondary">
                {player.team && <TeamBadge team={player.team} size="sm" />}
                {player.team?.city} {player.team?.name} · {player.position} · #{player.jerseyNumber}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {hasStatOverrides && (
                <button
                  type="button"
                  onClick={() => setStatOverrides({})}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Reset
                </button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditingStats((previous) => !previous)}
              >
                {isEditingStats ? "Done editing" : "Edit stats"}
              </Button>
              <Link
                to={`/compare?ids=${player.id}`}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-card hover:text-text-primary"
              >
                Compare
              </Link>
            </div>
          </div>

          {isEditingStats && (
            <p className="mt-3 text-xs text-text-muted">
              Editing locally — not saved, resets when you refresh or leave this page.
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="PPG"
              value={effectiveAverages.pointsPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.pointsPerGame}
              onEditValueChange={(value) => setStatOverride("pointsPerGame", value)}
            />
            <StatTile
              label="RPG"
              value={effectiveAverages.reboundsPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.reboundsPerGame}
              onEditValueChange={(value) => setStatOverride("reboundsPerGame", value)}
            />
            <StatTile
              label="APG"
              value={effectiveAverages.assistsPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.assistsPerGame}
              onEditValueChange={(value) => setStatOverride("assistsPerGame", value)}
            />
            <StatTile
              label="MPG"
              value={effectiveAverages.minutesPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.minutesPerGame}
              onEditValueChange={(value) => setStatOverride("minutesPerGame", value)}
            />
            <StatTile
              label="Games"
              value={effectiveAverages.gamesPlayed}
              isEditing={isEditingStats}
              editValue={effectiveAverages.gamesPlayed}
              onEditValueChange={(value) => setStatOverride("gamesPlayed", value)}
            />
            <StatTile
              label="STL"
              value={effectiveAverages.stealsPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.stealsPerGame}
              onEditValueChange={(value) => setStatOverride("stealsPerGame", value)}
            />
            <StatTile
              label="BLK"
              value={effectiveAverages.blocksPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.blocksPerGame}
              onEditValueChange={(value) => setStatOverride("blocksPerGame", value)}
            />
            <StatTile
              label="TOV"
              value={effectiveAverages.turnoversPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.turnoversPerGame}
              onEditValueChange={(value) => setStatOverride("turnoversPerGame", value)}
            />
          </div>

          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-text-secondary">Points trend</h2>
            <PointsTrendChart data={toTrendData(gameLog)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-2 text-sm font-medium text-text-secondary">Player traits</h2>
          <PlayerTraitsRadar seasonAverages={effectiveAverages} />
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-medium text-text-secondary">Shooting splits</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="FG%"
              value={`${effectiveAverages.fieldGoalPercentage}%`}
              isEditing={isEditingStats}
              editValue={effectiveAverages.fieldGoalPercentage}
              onEditValueChange={(value) => setStatOverride("fieldGoalPercentage", value)}
            />
            <StatTile
              label="3P%"
              value={`${effectiveAverages.threePointPercentage}%`}
              isEditing={isEditingStats}
              editValue={effectiveAverages.threePointPercentage}
              onEditValueChange={(value) => setStatOverride("threePointPercentage", value)}
            />
            <StatTile
              label="FT%"
              value={`${effectiveAverages.freeThrowPercentage}%`}
              isEditing={isEditingStats}
              editValue={effectiveAverages.freeThrowPercentage}
              onEditValueChange={(value) => setStatOverride("freeThrowPercentage", value)}
            />
            <StatTile
              label="FTA/G"
              value={effectiveAverages.freeThrowsAttemptedPerGame}
              isEditing={isEditingStats}
              editValue={effectiveAverages.freeThrowsAttemptedPerGame}
              onEditValueChange={(value) => setStatOverride("freeThrowsAttemptedPerGame", value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-medium text-text-secondary">Bio</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <BioField label="Height" value={formatHeight(player.heightInches)} />
            <BioField label="Weight" value={formatWeight(player.weightLbs)} />
            <BioField
              label="Born"
              value={formatBirthdate(player.birthDate)}
              isPending={bioPending}
            />
            <BioField
              label="Age"
              value={age === null ? "—" : `${age}`}
              isPending={bioPending}
            />
            <BioField
              label="School / Country"
              value={formatSchoolCountry(player)}
              isPending={bioPending}
            />
            <BioField
              label="Experience"
              value={player.seasonExp === null ? "—" : `${player.seasonExp} yrs`}
              isPending={bioPending}
            />
            <BioField label="Draft" value={formatDraft(player)} isPending={bioPending} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
