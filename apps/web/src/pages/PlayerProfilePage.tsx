import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchPlayer, fetchPlayerMatchupProjection, fetchPlayerStats, fetchPlayerStatsSplits } from "@/lib/nbaApi";
import { StatTile } from "@/components/StatTile";
import { PlayerTraitsRadar } from "@/components/PlayerTraitsRadar";
import { PointsTrendChart, type GamePointsDatum } from "@/components/PointsTrendChart";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { FollowPlayerButton } from "@/components/FollowPlayerButton";
import { MatchupAnalysis } from "@/components/MatchupAnalysis";
import { TeamBadge } from "@/components/TeamBadge";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { LockerSegmentControl } from "@/components/LockerSegmentControl";
import { SeasonSplitsTable } from "@/components/SeasonSplitsTable";
import { SectionLoading } from "@/components/ui/loading-overlay";
import { Reveal } from "@/components/landing/Reveal";
import { formatAge, formatHeight } from "@/lib/playerBio";
import { formatNumber, formatPercentage, formatPlusMinus } from "@/lib/advancedStats";
import { SEASON_TYPES_IN_ORDER, formatSeasonType, parseUrlSegment, toUrlSegment } from "@/lib/seasonType";
import type { Player, PlayerStatsResponse, SeasonAverages, SeasonType, UpcomingGameProjection } from "@/types/nba";

// The locker-outline button the header row shares — sharp border, mono
// micro-label, leather border on hover. `isActive` inverts to a leather
// fill for toggles (the edit overlay) so the engaged state reads at a
// glance.
const LOCKER_BUTTON_CLASS =
  "border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather";
const LOCKER_BUTTON_ACTIVE_CLASS =
  "border border-locker-leather bg-locker-leather px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-white uppercase transition-colors";

// A card-internal section title in the predictions/home pattern: display
// type, wide tracking, hairline rule running out to the card's right edge.
function SectionHeading({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
        {title}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-landing-light" />
    </div>
  );
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

// Distinct league years in the log, most recent first. "2025-26" sorts
// after "2024-25" both lexicographically and chronologically, so a plain
// descending sort orders them correctly without a season-parsing helper.
// Rows from before the API tagged games with their league year (or a
// cached response from then) have no usable season — they are dropped so
// they render no phantom chip, and the chart falls back to plotting the
// whole log.
function seasonsInGameLog(gameLog: PlayerStatsResponse["gameLog"]): string[] {
  return [...new Set(gameLog.map((game) => game.season))]
    .filter((season) => typeof season === "string" && season !== "")
    .sort()
    .reverse();
}

// A full NBA regular-season schedule — the length the projected view
// charts, since an upcoming season has no game log to truncate by.
const PROJECTED_SEASON_GAME_COUNT = 82;

// Sentinel value for the projection chip in trendSeason — not a real
// season label, so it can never collide with a league year from the log.
const PROJECTED_TREND_SEASON = "projected";

// "2025-26" → "2026-27": the upcoming league year, for the projection
// chip's label. Unparseable input falls back to a generic label.
function nextSeasonLabel(latestSeason: string): string {
  const startYear = Number.parseInt(latestSeason.slice(0, 4), 10);
  if (!Number.isFinite(startYear)) return "Upcoming";
  return `${startYear + 1}-${String((startYear + 2) % 100).padStart(2, "0")}`;
}

// Fallback projection when the team has nothing scheduled (or the matchup
// data hasn't loaded): the current segment's per-game scoring average
// carried across a full schedule — deliberately the simplest honest
// forecast. The preferred projection is opponent-adjusted per game (see
// toMatchupTrendData below).
function toProjectedTrendData(pointsPerGame: number): GamePointsDatum[] {
  return Array.from({ length: PROJECTED_SEASON_GAME_COUNT }, (_, index) => ({
    gameLabel: `G${index + 1}`,
    points: pointsPerGame,
  }));
}

// The preferred projection view: one chart point per still-unplayed game,
// the point varying with the opponent — a flat line here would mean the
// matchup analysis found nothing to say.
function toMatchupTrendData(upcomingGames: UpcomingGameProjection[]): GamePointsDatum[] {
  return upcomingGames.map((game, index) => ({
    gameLabel: `G${index + 1}`,
    points: game.projectedPoints,
    opponent: game.opponent.abbreviation,
    isHome: game.isHome,
  }));
}

// The trend picker's chips share LockerSegmentControl's option idiom —
// same type scale, leather fill for the pressed state.
const TREND_CHIP_CLASS =
  "px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50";

function trendChipClass(isActive: boolean): string {
  return `${TREND_CHIP_CLASS} ${isActive ? "bg-locker-leather text-white" : "text-locker-ink-muted hover:text-landing-ink"}`;
}

// Mirrors StatTile's locker styling so the Bio section reads as part of
// the same page, but sizes its value for prose (dates, schools) rather
// than the large numerals StatTile uses. When `isPending` is set the
// field shows a muted "Loading…" instead of a real value or a misleading
// "—".
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
    <div className="border border-landing-light bg-landing-hero px-4 py-3">
      <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{label}</div>
      <div className={`mt-1 text-[13px] font-medium ${isPending ? "text-locker-ink-muted" : "text-landing-ink"}`}>
        {isPending ? "Loading…" : value}
      </div>
    </div>
  );
}

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Browser-back when there is history to return to (the usual path in
  // from the players list). A direct landing has no in-app history, so the
  // fallback goes to the players list rather than navigating away from
  // the app entirely.
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/players");
  }

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
  // separately and switching segments refetches. keepPreviousData keeps the
  // current segment's figures on screen while the next one loads — the
  // alternative is the whole page dropping to its loading spinner for what
  // is only a re-scoping of one section. The figures shown during the
  // switch are always the previous segment's (never another player's:
  // playerQuery has no placeholder, so a player change still full-loads).
  const statsQuery = useQuery({
    queryKey: ["playerStats", playerId, seasonType],
    queryFn: () => fetchPlayerStats(playerId!, seasonType),
    enabled: !!playerId,
    placeholderData: keepPreviousData,
  });

  const splitsQuery = useQuery({
    queryKey: ["playerStatsSplits", playerId],
    queryFn: () => fetchPlayerStatsSplits(playerId!),
    enabled: !!playerId,
  });

  // Opponent splits + upcoming-game projections. Independent of the segment
  // selector: matchups are a regular-season concept, so the API's own
  // default (REGULAR) is used rather than coupling this to seasonType.
  const matchupQuery = useQuery({
    queryKey: ["playerMatchupProjection", playerId],
    queryFn: () => fetchPlayerMatchupProjection(playerId!),
    enabled: !!playerId,
  });

  // A local, never-persisted "what if" overlay on top of the real season
  // averages — lets a visitor try out different numbers and watch the stat
  // tiles/radar react, without touching the server or surviving a refresh.
  const [isEditingStats, setIsEditingStats] = useState(false);
  const [statOverrides, setStatOverrides] = useState<Partial<SeasonAverages>>({});
  // Which league year's games the trend chart plots; null follows the
  // most recent season present in the log (see availableSeasons below).
  const [trendSeason, setTrendSeason] = useState<string | null>(null);

  // Latched "settled once" flag — the predictions page pattern: the first
  // load keeps the full-page spinner, then every later segment switch
  // blurs the stats sections in place (see SectionLoading below) instead
  // of dropping them back to the spinner.
  const [hasLoadedStatsOnce, setHasLoadedStatsOnce] = useState(false);
  useEffect(() => {
    if (statsQuery.isSuccess) setHasLoadedStatsOnce(true);
  }, [statsQuery.isSuccess]);

  // Cleared when the segment changes as well as the player: an override
  // typed against a regular-season line has no meaning once the tiles are
  // showing Finals numbers, and carrying it over would put a hand-entered
  // regular-season figure inside a postseason view. The charted season
  // resets for the same reason — a season picked under "regular" says
  // nothing about which postseason games exist.
  useEffect(() => {
    setIsEditingStats(false);
    setStatOverrides({});
    setTrendSeason(null);
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
      <div className="flex min-h-full items-center justify-center bg-landing-hero p-6">
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

  // The chart plots one league year at a time — a multi-season log is
  // several overlapping stories (different teammates, ages, roles) that a
  // single line can't tell. Default is the most recent season present.
  // The projection sentinel charts a full schedule at the current line's
  // scoring rate instead of any played games.
  const availableSeasons = seasonsInGameLog(gameLog);
  const activeTrendSeason = trendSeason ?? availableSeasons[0] ?? null;
  const isProjectionActive = activeTrendSeason === PROJECTED_TREND_SEASON;
  const isSwitchingStatsSegment = hasLoadedStatsOnce && statsQuery.isFetching;
  // The projection charts the upcoming schedule game by game, each point
  // adjusted for that game's opponent — a regular-season concept, so the
  // chip only appears there and only when there is a rate to project from.
  const showProjectionChip = seasonType === "REGULAR" && hasGamesInSegment;
  // Prefer the opponent-adjusted per-game line; fall back to the flat
  // season-rate line only when the matchup data is still in flight or the
  // team has nothing left on the schedule.
  const matchupUpcomingGames = matchupQuery.data?.upcomingGames ?? [];
  const trendData = isProjectionActive
    ? matchupUpcomingGames.length > 0
      ? toMatchupTrendData(matchupUpcomingGames)
      : toProjectedTrendData(seasonAverages.pointsPerGame)
    : toTrendData(
        activeTrendSeason ? gameLog.filter((game) => game.season === activeTrendSeason) : gameLog
      );

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <div className="mb-4">
          <button type="button" onClick={goBack} className={LOCKER_BUTTON_CLASS}>
            ← Back
          </button>
        </div>
        {/* The page's panel grid is unchanged from the previous layout —
            only the surface each panel sits on moved to the locker
            language. */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Each panel rises in as it scrolls into view (the landing
              page's Reveal idiom — light, replaying on re-entry). Grid
              spans live on the Reveal wrapper since it is the grid item;
              the stats sections keep their in-place blur underneath. */}
          <Reveal className="xl:col-span-2">
            <SectionLoading loading={isSwitchingStatsSegment} label="Loading player stats">
            <section className="border border-landing-light bg-locker-surface p-6">
            <div className="flex flex-wrap items-center gap-4">
              <PlayerHeadshot player={player} size="lg" />
              <div className="min-w-0">
                <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">
                  {player.firstName} {player.lastName}
                </h1>
                <p className="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-locker-ink-muted uppercase">
                  {player.team && <TeamBadge team={player.team} size="sm" />}
                  {player.team?.city} {player.team?.name} · {player.position} · #{player.jerseyNumber}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {/* Renders nothing for a signed-out visitor (its own
                    contract), so no gate is needed here. */}
                <FollowPlayerButton
                  playerId={player.id}
                  playerName={`${player.firstName} ${player.lastName}`}
                />
                {hasStatOverrides && (
                  <button
                    type="button"
                    onClick={() => setStatOverrides({})}
                    className="px-2 py-2 font-mono text-[10.5px] tracking-[0.14em] text-locker-ink-muted uppercase transition-colors hover:text-locker-leather"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingStats((previous) => !previous)}
                  className={isEditingStats ? LOCKER_BUTTON_ACTIVE_CLASS : LOCKER_BUTTON_CLASS}
                >
                  {isEditingStats ? "Done editing" : "Edit stats"}
                </button>
                {/* Carries the selected segment, so comparing from a Finals
                    view opens a Finals comparison rather than silently
                    dropping back to the regular season. */}
                <Link to={`/compare?ids=${player.id}&segment=${toUrlSegment(seasonType)}`} className={LOCKER_BUTTON_CLASS}>
                  Compare
                </Link>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <LockerSegmentControl value={seasonType} onChange={selectSeasonType} options={SEASON_TYPES_IN_ORDER} />
              <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                Showing {formatSeasonType(seasonType).toLowerCase()} figures only
              </span>
            </div>

            {isEditingStats && (
              <p className="mt-3 text-[12.5px] text-locker-ink-muted">
                Editing locally — not saved, resets when you refresh, change segment, or leave this page.
              </p>
            )}

            {!hasGamesInSegment && (
              <div className="mt-4 border border-landing-light bg-landing-hero px-4 py-3">
                <p className="text-[12.5px] text-locker-ink-muted">
                  {player.firstName} {player.lastName} did not play in the {formatSeasonType(seasonType)} this season
                  — the figures below are all zero because there are no games to derive them from, not because they
                  were poor.
                </p>
              </div>
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
              <SectionHeading title={`Points trend · ${formatSeasonType(seasonType)}`} />
              {(availableSeasons.length > 0 || showProjectionChip) && (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div
                    role="group"
                    aria-label="Season to chart"
                    className="inline-flex flex-wrap gap-1 border border-landing-light bg-landing-hero p-1"
                  >
                    {availableSeasons.map((season) => (
                      <button
                        key={season}
                        type="button"
                        aria-pressed={season === activeTrendSeason}
                        onClick={() => setTrendSeason(season)}
                        className={trendChipClass(season === activeTrendSeason)}
                      >
                        {season}
                      </button>
                    ))}
                    {showProjectionChip && (
                      <button
                        key={PROJECTED_TREND_SEASON}
                        type="button"
                        aria-pressed={isProjectionActive}
                        onClick={() => setTrendSeason(PROJECTED_TREND_SEASON)}
                        className={trendChipClass(isProjectionActive)}
                      >
                        {nextSeasonLabel(availableSeasons[0] ?? "")} · projected
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                    {isProjectionActive
                      ? matchupUpcomingGames.length > 0
                        ? `Opponent-adjusted · ${matchupUpcomingGames.length}-game schedule`
                        : `Projected at ${seasonAverages.pointsPerGame.toFixed(1)} PPG · ${PROJECTED_SEASON_GAME_COUNT}-game schedule`
                      : `${trendData.length} ${trendData.length === 1 ? "game" : "games"} charted`}
                  </span>
                </div>
              )}
              <PointsTrendChart data={trendData} projected={isProjectionActive} />
            </div>
            </section>
            </SectionLoading>
          </Reveal>

          <Reveal delay={1}>
            <SectionLoading loading={isSwitchingStatsSegment} label="Loading player stats">
            <section className="border border-landing-light bg-locker-surface p-6">
              <SectionHeading title="Player traits" />
            <PlayerTraitsRadar seasonAverages={effectiveAverages} />
            </section>
            </SectionLoading>
          </Reveal>

          <Reveal className="xl:col-span-3">
            <SectionLoading loading={isSwitchingStatsSegment} label="Loading player stats">
            <section className="border border-landing-light bg-locker-surface p-6">
              <SectionHeading title="Shooting splits" />
            {/* Six across so the two efficiency measures sit on the same
                line as the raw percentages they contextualise — TS% and
                eFG% are only meaningful next to FG% and 3P%. */}
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
            </section>
            </SectionLoading>
          </Reveal>

          {/* The one place segments are deliberately shown side by side: how
              a player's production shifted once the postseason started is the
              question the segment views exist to answer, so comparing them
              here is the point rather than a bleed. Rendered independently of
              the segment selector above — this section is about the change
              between segments, not about whichever one is currently
              selected. */}
          <Reveal className="xl:col-span-3">
          <section className="border border-landing-light bg-locker-surface p-6">
            <SectionHeading title="Regular season vs. postseason" />
            <p className="mb-4 text-[12.5px] text-locker-ink-muted">
              Change from this player's regular-season line. Postseason samples are small, so rates from fewer than
              four games are dimmed.
            </p>
            {splitsQuery.isPending && <p className="text-[12.5px] text-locker-ink-muted">Loading splits…</p>}
            {splitsQuery.isError && (
              <p className="text-[12.5px] text-locker-ink-muted">Could not load postseason splits for this player.</p>
            )}
            {splitsQuery.data && (
              <SeasonSplitsTable
                splits={splitsQuery.data.splits}
                playerName={`${player.firstName} ${player.lastName}`}
              />
            )}
          </section>
          </Reveal>

          <Reveal className="xl:col-span-3">
          <section className="border border-landing-light bg-locker-surface p-6">
            <SectionHeading title="Matchup analysis" />
            <p className="mb-4 text-[12.5px] text-locker-ink-muted">
              Scoring against each opponent over this player's regular-season history, and the projected line for the
              games still to come — every projection blends the overall rate with the opponent-specific one, trusting
              the split more as the sample grows.
            </p>
            {matchupQuery.isPending && <p className="text-[12.5px] text-locker-ink-muted">Loading matchup analysis…</p>}
            {matchupQuery.isError && (
              <p className="text-[12.5px] text-locker-ink-muted">Could not load matchup analysis for this player.</p>
            )}
            {matchupQuery.data && <MatchupAnalysis projection={matchupQuery.data} />}
          </section>
          </Reveal>

          <Reveal className="xl:col-span-3">
          <section className="border border-landing-light bg-locker-surface p-6">
            <SectionHeading title="Bio" />
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
          </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
