import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ComparisonTraitsRadar } from "@/components/ComparisonTraitsRadar";
import { ErrorState } from "@/components/ErrorState";
import { PlayerTraitsRadar } from "@/components/PlayerTraitsRadar";
import { PointsTrendChart } from "@/components/PointsTrendChart";
import { StatTile } from "@/components/StatTile";
import { EvidenceUploader } from "@/components/becomepro/EvidenceUploader";
import { ProRankBadge } from "@/components/becomepro/ProRankBadge";
import { ProspectValueCard } from "@/components/becomepro/ProspectValueCard";
import { SeasonEntryPanel } from "@/components/becomepro/SeasonEntryPanel";
import { LockerSection } from "@/components/home/LockerSection";
import { Reveal } from "@/components/landing/Reveal";
import { PageLoading } from "@/components/ui/loading-overlay";
import { fetchProspect, prospectQueryKey } from "@/lib/becomeProApi";
import { formatNumber, formatPercentage } from "@/lib/advancedStats";
import { NO_VALUE } from "@/lib/playerBio";
import {
  COMPETITION_LEVEL_LABELS,
  describeRankState,
  hasAttempts,
} from "@/lib/prospectValue";
import { isSmallSample } from "@/lib/seasonType";
import type {
  GameLogEntry,
  ProspectProfile,
  SeasonAverages,
  TraitsComparisonEntry,
} from "@/types/nba";

// The trend chart plots labelled points, so the game log's dates become the
// labels. Oldest first: the log arrives newest-first for the tables, but a
// trend line has to read left to right in time.
function toTrendData(gameLog: GameLogEntry[]) {
  return [...gameLog]
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((entry) => ({ gameLabel: entry.gameDate, points: entry.points }));
}

/**
 * One prospect's season — theirs or your own.
 *
 * Deliberately ONE component for both. `isSelf` from the API turns on the
 * entry panel and the evidence uploader; everything else is identical, because
 * what a visitor sees of your season and what you see of it should be the same
 * figures presented the same way. A separate "my season" route would be the
 * same page with three extra blocks and two chances to drift apart.
 */
export function ProspectPage() {
  const { username } = useParams<{ username: string }>();
  const [seasonId, setSeasonId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...prospectQueryKey(username ?? ""), seasonId],
    queryFn: () => fetchProspect(username!, seasonId ?? undefined),
    enabled: Boolean(username),
  });

  if (isError) {
    return <ErrorState message="Could not load this prospect." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="min-h-full bg-landing-hero p-4 sm:p-6">
        <PageLoading label="Loading prospect" />
      </div>
    );
  }

  return <ProspectView profile={data} onSelectSeason={setSeasonId} />;
}

function ProspectView({
  profile,
  onSelectSeason,
}: {
  profile: ProspectProfile;
  onSelectSeason: (seasonId: string) => void;
}) {
  const activeSeason =
    profile.seasons.find((season) => season.id === profile.activeSeasonId) ?? profile.seasons[0];
  const averages = profile.seasonAverages;
  const shortfall = describeRankState(
    profile.rankState,
    activeSeason?.gamesLogged ?? 0,
    profile.valuation.minimumGamesRequired
  );

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Reveal>
          <div className="border border-landing-light bg-locker-surface p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <ProRankBadge rank={profile.rank} className="text-locker-leather" />
              <h1 className="font-display text-2xl tracking-[0.01em] break-all text-landing-ink uppercase">
                {profile.displayName}
              </h1>
              {/* Absence always arrives with its reason — a bare "unranked"
                  chip leaves a qualified user unsure if anything is broken. */}
              {profile.rank === null && shortfall && (
                <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                  Not yet ranked
                </span>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-locker-ink-muted">
              {activeSeason
                ? `${activeSeason.season} · ${COMPETITION_LEVEL_LABELS[activeSeason.competitionLevel]} · ${activeSeason.position}`
                : "No season logged yet."}
              {activeSeason?.teamName ? ` · ${activeSeason.teamName}` : ""}
            </p>
            {profile.rank === null && shortfall && (
              <p className="mt-2 text-[12px] text-locker-ink-muted">{shortfall}</p>
            )}

            {profile.seasons.length > 1 && (
              <div
                role="radiogroup"
                aria-label="Season"
                className="mt-4 inline-flex flex-wrap gap-1 border border-landing-light bg-landing-hero p-1"
              >
                {profile.seasons.map((season) => (
                  <button
                    key={season.id}
                    type="button"
                    role="radio"
                    aria-checked={season.id === profile.activeSeasonId}
                    onClick={() => onSelectSeason(season.id)}
                    className={`min-h-9 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors sm:min-h-0 ${
                      season.id === profile.activeSeasonId
                        ? "bg-locker-leather text-white"
                        : "text-locker-ink-muted hover:text-landing-ink"
                    }`}
                  >
                    {season.season}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-8">
            <Reveal>
              <LockerSection title="Season line">
                <SeasonStatGrid averages={averages} />
                {isSmallSample(averages.gamesPlayed) && (
                  <p className="mt-2 text-[11px] text-locker-ink-muted">
                    Only {averages.gamesPlayed} games — the rate figures above will move a lot with
                    each new one.
                  </p>
                )}
              </LockerSection>
            </Reveal>

            {averages.gamesPlayed > 0 && (
              <Reveal delay={1}>
                <LockerSection title="Scoring by game">
                  <PointsTrendChart data={toTrendData(profile.gameLog)} />
                </LockerSection>
              </Reveal>
            )}

            {profile.valuation.comparables.length > 0 && (
              <Reveal delay={1}>
                <LockerSection title="Against NBA players">
                  <ComparablesPanel profile={profile} />
                </LockerSection>
              </Reveal>
            )}

            {/* Owner-only. Gated on the API's own isSelf rather than on a
                client-side username comparison, so the affordance and the
                permission cannot disagree. */}
            {profile.isSelf && activeSeason && (
              <>
                <Reveal delay={2}>
                  <LockerSection title="Your games">
                    <SeasonEntryPanel
                      season={activeSeason}
                      games={profile.games}
                      username={profile.username}
                    />
                  </LockerSection>
                </Reveal>
                <Reveal delay={2}>
                  <LockerSection title="Verification">
                    <EvidenceUploader
                      seasonId={activeSeason.id}
                      username={profile.username}
                      evidence={profile.evidence}
                    />
                  </LockerSection>
                </Reveal>
              </>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <Reveal delay={1}>
              <ProspectValueCard
                valuation={profile.valuation}
                reliability={profile.reliability}
                rank={profile.rank}
                rankState={profile.rankState}
                competitionLevel={activeSeason?.competitionLevel ?? "REC"}
                gamesLogged={activeSeason?.gamesLogged ?? 0}
              />
            </Reveal>
            {averages.gamesPlayed > 0 && (
              <Reveal delay={2}>
                <LockerSection title="Traits">
                  <PlayerTraitsRadar seasonAverages={averages} />
                </LockerSection>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A percentage derived from zero attempts is 0 and meaningless — SeasonAverages
// types it as a plain number (see lib/prospectValue.ts), so it is suppressed
// here at the edge rather than by widening a type every NBA page depends on.
function shootingValue(percentage: number, attemptsPerGame: number): string {
  return hasAttempts(attemptsPerGame) ? formatPercentage(percentage) : NO_VALUE;
}

function SeasonStatGrid({ averages }: { averages: SeasonAverages }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Games" value={averages.gamesPlayed} />
      <StatTile label="PPG" value={formatNumber(averages.pointsPerGame)} />
      <StatTile label="RPG" value={formatNumber(averages.reboundsPerGame)} />
      <StatTile label="APG" value={formatNumber(averages.assistsPerGame)} />
      <StatTile label="SPG" value={formatNumber(averages.stealsPerGame)} />
      <StatTile label="BPG" value={formatNumber(averages.blocksPerGame)} />
      <StatTile label="MPG" value={formatNumber(averages.minutesPerGame)} />
      <StatTile label="TOV" value={formatNumber(averages.turnoversPerGame)} />
      <StatTile
        label="FG%"
        value={shootingValue(averages.fieldGoalPercentage, averages.fieldGoalsAttemptedPerGame)}
      />
      <StatTile
        label="3P%"
        value={shootingValue(averages.threePointPercentage, averages.threesAttemptedPerGame)}
      />
      <StatTile
        label="FT%"
        value={shootingValue(averages.freeThrowPercentage, averages.freeThrowsAttemptedPerGame)}
      />
      <StatTile
        label="TS%"
        value={shootingValue(averages.trueShootingPercentage, averages.fieldGoalsAttemptedPerGame)}
      />
    </div>
  );
}

function ComparablesPanel({ profile }: { profile: ProspectProfile }) {
  // The prospect goes FIRST so they take COMPARISON_PLAYER_COLORS[0] —
  // locker-leather, the app's subject accent — and read as the subject of the
  // comparison rather than one more player in it.
  const entries: TraitsComparisonEntry[] = [
    {
      player: { id: profile.username, firstName: profile.displayName, lastName: "" },
      seasonAverages: profile.seasonAverages,
    },
    ...profile.valuation.comparables.map((comparable) => ({
      player: comparable.player,
      seasonAverages: comparable.seasonAverages,
    })),
  ];

  return (
    <div>
      <ComparisonTraitsRadar entries={entries} />
      <p className="mt-3 text-[11.5px] text-locker-ink-muted">
        Similarity is a shape match on the level-adjusted season line — it says these profiles look
        alike, not that the players are equivalent.
      </p>
      <ul className="mt-3 space-y-1.5 border-t border-landing-light pt-3">
        {profile.valuation.comparables.map((comparable) => (
          <li key={comparable.player.id} className="text-[12px]">
            <Link
              to={`/players/${comparable.player.id}`}
              className="text-landing-ink underline-offset-[3px] hover:underline"
            >
              {comparable.player.firstName} {comparable.player.lastName}
            </Link>
            <span className="ml-1.5 text-locker-ink-muted tabular-nums">
              {Math.round(comparable.similarity * 100)}% similar
            </span>
          </li>
        ))}
      </ul>

      {profile.valuation.slotAlumni.length > 0 && (
        <div className="mt-4 border-t border-landing-light pt-3">
          <p className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
            Drafted at this slot
          </p>
          <ul className="mt-1.5 space-y-1">
            {profile.valuation.slotAlumni.map((alumnus) => (
              <li key={alumnus.player.id} className="text-[12px]">
                <Link
                  to={`/players/${alumnus.player.id}`}
                  className="text-landing-ink underline-offset-[3px] hover:underline"
                >
                  {alumnus.player.firstName} {alumnus.player.lastName}
                </Link>
                <span className="ml-1.5 text-locker-ink-muted tabular-nums">{alumnus.draftYear}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
