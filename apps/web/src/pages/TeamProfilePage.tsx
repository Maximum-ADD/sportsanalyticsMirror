import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchEloRatings, fetchPlayers, fetchTeam, fetchTeamRecords } from "@/lib/nbaApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { PageLoading, SectionLoading } from "@/components/ui/loading-overlay";
import { ErrorState } from "@/components/ErrorState";
import { FollowTeamButton } from "@/components/FollowTeamButton";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { Reveal } from "@/components/landing/Reveal";
import { TeamBadge } from "@/components/TeamBadge";

const LOCKER_BUTTON_CLASS =
  "border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather";

const TABLE_HEADERS = ["Player", "Position", "Jersey"] as const;

export function TeamProfilePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  // Same browser-back-with-fallback pattern as the player profile page's
  // own goBack: the usual path in is from the teams list, but a direct
  // landing has no in-app history to return to.
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/teams");
  }

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => fetchTeam(teamId!),
    enabled: !!teamId,
  });

  const rosterQuery = useQuery({
    queryKey: ["players", { teamId }],
    queryFn: () => fetchPlayers({ teamId }),
    enabled: !!teamId,
  });

  // Whole-league reads, same as the teams list — cheap to fetch again here
  // since react-query dedupes/caches them under the same query key.
  const eloQuery = useQuery({ queryKey: ["teamEloRatings"], queryFn: fetchEloRatings });
  const recordsQuery = useQuery({ queryKey: ["teamRecords"], queryFn: fetchTeamRecords });

  if (teamQuery.isError) {
    return <ErrorState message="Could not load team." onRetry={() => teamQuery.refetch()} />;
  }
  if (rosterQuery.isError) {
    return <ErrorState message="Could not load roster." onRetry={() => rosterQuery.refetch()} />;
  }

  if (teamQuery.isPending) {
    return (
      <div className="min-h-full bg-landing-hero">
        <PageLoading label="Loading team" />
      </div>
    );
  }

  const team = teamQuery.data;
  const elo = eloQuery.data?.find((rating) => rating.team.id === team.id)?.elo ?? null;
  const record = recordsQuery.data?.find((entry) => entry.teamId === team.id) ?? null;

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <Reveal>
          <button type="button" onClick={goBack} className={`mb-4 ${LOCKER_BUTTON_CLASS}`}>
            ← Back
          </button>
        </Reveal>

        <Reveal>
          <div className="mb-6 border border-landing-light bg-locker-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <TeamBadge team={team} size="md" className="size-14 text-base" />
                <div>
                  <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">
                    {team.city} {team.name}
                  </h1>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                      {team.abbreviation}
                    </span>
                    <span className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                      {team.conference}
                    </span>
                    <span className="border border-landing-light px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                      {team.division}
                    </span>
                  </div>
                </div>
              </div>
              <FollowTeamButton teamId={team.id} teamName={`${team.city} ${team.name}`} />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-landing-light pt-4 sm:max-w-md">
              <div>
                <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Record</div>
                <div className="font-display text-lg text-landing-ink tabular-nums">
                  {record ? `${record.wins}–${record.losses}` : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Win %</div>
                <div className="font-display text-lg text-landing-ink tabular-nums">
                  {record?.winPercentage !== null && record?.winPercentage !== undefined
                    ? `${Math.round(record.winPercentage * 100)}%`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">Elo</div>
                <div className="font-display text-lg text-locker-leather tabular-nums">
                  {elo !== null ? Math.round(elo) : "—"}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mb-3 font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">Roster</h2>
          <SectionLoading loading={rosterQuery.isSuccess && rosterQuery.isFetching} label="Loading roster">
            <div className="overflow-hidden border border-landing-light bg-locker-surface">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-landing-light bg-landing-hero">
                    {TABLE_HEADERS.map((header) => (
                      <th
                        key={header}
                        className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rosterQuery.isPending ? (
                    <tr>
                      <td colSpan={TABLE_HEADERS.length} className="py-10">
                        <BasketballSpinner label="Loading roster" />
                      </td>
                    </tr>
                  ) : rosterQuery.data?.data.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_HEADERS.length} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                        No roster players found.
                      </td>
                    </tr>
                  ) : (
                    rosterQuery.data?.data.map((player) => (
                      <tr
                        key={player.id}
                        className="border-b border-landing-light transition-colors last:border-b-0 hover:bg-landing-hero"
                      >
                        <td className="px-3 py-2.5">
                          <Link to={`/players/${player.id}`} className="flex items-center gap-2.5 group">
                            <PlayerHeadshot player={player} size="sm" className="size-8" alt="" />
                            <span className="text-[13px] text-landing-ink group-hover:text-locker-leather">
                              {player.firstName} {player.lastName}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] tracking-[0.08em] text-locker-ink-muted uppercase">
                          {player.position}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted tabular-nums">
                          {player.jerseyNumber ? `#${player.jerseyNumber}` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionLoading>
        </Reveal>
      </div>
    </div>
  );
}
