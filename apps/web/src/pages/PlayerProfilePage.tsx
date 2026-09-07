import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchPlayer, fetchPlayerStats, fetchPlayerStatsSplits } from "@/lib/nbaApi";
import { StatTile } from "@/components/StatTile";
import { PlayerTraitsRadar } from "@/components/PlayerTraitsRadar";
import { PointsTrendChart, type GamePointsDatum } from "@/components/PointsTrendChart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { SeasonSegmentControl } from "@/components/SeasonSegmentControl";
import { SeasonSplitsTable } from "@/components/SeasonSplitsTable";
import { formatAge, formatHeight } from "@/lib/playerBio";
import { formatNumber, formatPercentage, formatPlusMinus } from "@/lib/advancedStats";
import { SEASON_TYPES_IN_ORDER, formatSeasonType, parseUrlSegment, toUrlSegment } from "@/lib/seasonType";
import type { Player, PlayerStatsResponse, SeasonAverages, SeasonType } from "@/types/nba";

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
  const [searchParams, setSearchParams] = useSearchParams();

  // The selected segment lives in the URL (?segment=playoffs) so a view of
  // a player's Finals is a shareable link and survives a reload, matching
  // how the compare page already keeps its selection in the URL.
  const seasonType = parseUrlSegment(searchParams.get("segment"));

  function selectSeasonType(nextSeasonType: SeasonType) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("segment", toUrlSegment(nextSeasonType));
    setSearchParams(nextParams, { replace: true });
  }

  const playerQuery = useQuery({
    queryKey: ["player", playerId],
    queryFn: () => fetchPlayer(playerId!),
    enabled: !!playerId,
  });

  // seasonType is part of the query key, so each segment is cached
  // separately and switching segments refetches rather than briefly showing
  // the previous segment's numbers under the new heading.
  const statsQuery = useQuery({
    queryKey: ["playerStats", playerId, seasonType],
    queryFn: () => fetchPlayerStats(playerId!, seasonType),
    enabled: !!playerId,
  });

  const splitsQuery = useQuery({
    queryKey: ["playerStatsSplits", playerId],
    queryFn: () => fetchPlayerStatsSplits(playerId!),
    enabled: !!playerId,
  });

  // A local, never-persisted "what if" overlay on top of the real season
  // averages — lets a visitor try out different numbers and watch the stat
  // tiles/radar react, without touching the server or surviving a refresh.
  const [isEditingStats, setIsEditingStats] = useState(false);
  const [statOverrides, setStatOverrides] = useState<Partial<SeasonAverages>>({});

  // Cleared when the segment changes as well as the player: an override
  // typed against a regular-season line has no meaning once the tiles are
  // showing Finals numbers, and carrying it over would put a hand-entered
  // regular-season figure inside a postseason view.
  useEffect(() => {
    setIsEditingStats(false);
    setStatOverrides({});
  }, [playerId, seasonType]);

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
      <div className="flex min-h-[28rem] items-center justify-center p-6">
        <BasketballSpinner size="lg" label="Loading player" />
      </div>
    );
  }

  const player = playerQuery.data;
  const { seasonAverages, gameLog } = statsQuery.data;
  const effectiveAverages: SeasonAverages = { ...seasonAverages, ...statOverrides };
  const hasStatOverrides = Object.keys(statOverrides).length > 0;
  const hasGamesInSegment = seasonAverages.gamesPlayed > 0;
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

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SeasonSegmentControl value={seasonType} onChange={selectSeasonType} options={SEASON_TYPES_IN_ORDER} />
            <span className="text-xs text-text-muted">
              Showing {formatSeasonType(seasonType).toLowerCase()} figures only
            </span>
          </div>

          {isEditingStats && (
            <p className="mt-3 text-xs text-text-muted">
              Editing locally — not saved, resets when you refresh, change segment, or leave this page.
            </p>
          )}

          {!hasGamesInSegment && (
            <p className="mt-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-sm text-text-secondary">
              {player.firstName} {player.lastName} did not play in the {formatSeasonType(seasonType)} this season —
              the figures below are all zero because there are no games to derive them from, not because they were
              poor.
            </p>
          )}

          {/* Six columns rather than five: the four advanced tiles below
              (usage, +/-, and the two ratings) bring the count to twelve,
              which fills two clean rows at six across instead of leaving a
              ragged trailing row. */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
            {/* Not editable, unlike the counting stats above. The local
                "what if" overlay exists to explore how a player's own
                production would change; usage rate and the ratings are
                measured against the rest of the team and the opponent, so a
                hand-typed value wouldn't mean anything. They also render
                "—" when absent, which an editable number input can't. */}
            <StatTile label="USG%" value={formatPercentage(effectiveAverages.usagePercentage)} />
            <StatTile label="+/-" value={formatPlusMinus(effectiveAverages.plusMinusPerGame)} />
            <StatTile label="ORTG" value={formatNumber(effectiveAverages.offensiveRating)} />
            <StatTile label="DRTG" value={formatNumber(effectiveAverages.defensiveRating)} />
          </div>

          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-text-secondary">
              Points trend · {formatSeasonType(seasonType)}
            </h2>
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
          {/* Six across so the two efficiency measures sit on the same line
              as the raw percentages they contextualise — TS% and eFG% are
              only meaningful next to FG% and 3P%. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
            {/* Derived from the same makes/attempts the tiles above show,
                so editing them directly would let the overlay contradict
                itself — a hand-set TS% next to an unchanged FG%. */}
            <StatTile label="TS%" value={`${effectiveAverages.trueShootingPercentage}%`} />
            <StatTile label="eFG%" value={`${effectiveAverages.effectiveFieldGoalPercentage}%`} />
          </div>
        </CardContent>
      </Card>

      {/* The one place segments are deliberately shown side by side: how a
          player's production shifted once the postseason started is the
          question the segment views exist to answer, so comparing them here
          is the point rather than a bleed. Rendered independently of the
          segment selector above — this section is about the change between
          segments, not about whichever one is currently selected. */}
      <Card className="xl:col-span-3">
        <CardContent className="p-6">
          <h2 className="mb-1 text-sm font-medium text-text-secondary">Regular season vs. postseason</h2>
          <p className="mb-4 text-xs text-text-muted">
            Change from this player's regular-season line. Postseason samples are small, so rates from fewer than
            four games are dimmed.
          </p>
          {splitsQuery.isPending && <p className="text-sm text-text-muted">Loading splits…</p>}
          {splitsQuery.isError && (
            <p className="text-sm text-text-muted">Could not load postseason splits for this player.</p>
          )}
          {splitsQuery.data && (
            <SeasonSplitsTable
              splits={splitsQuery.data.splits}
              playerName={`${player.firstName} ${player.lastName}`}
            />
          )}
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
              value={formatAge(player.birthDate)}
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
