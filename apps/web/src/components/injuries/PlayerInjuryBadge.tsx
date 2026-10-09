import { useQuery } from "@tanstack/react-query";
import { fetchPlayerInjury } from "@/lib/injuriesApi";
import {
  formatExpectedReturn,
  formatInjuryDescription,
  formatInjuryStatus,
  getSeverityPillClass,
  INJURY_SOURCE_CREDIT,
} from "@/lib/injuryDisplay";

/**
 * A player's current injury from ESPN's report, for the player profile
 * header: "Out · Right ankle · Sprain", then the expected return.
 *
 * Renders nothing while loading, when the player isn't injured, and when the
 * report is unavailable: a healthy player is the usual case, and an ESPN
 * outage shouldn't put an error in the middle of a player's header.
 */
export function PlayerInjuryBadge({ playerId }: { playerId: string }) {
  const injuryQuery = useQuery({
    queryKey: ["playerInjury", playerId],
    queryFn: () => fetchPlayerInjury(playerId),
    retry: false,
  });

  const injury = injuryQuery.data?.injury;
  if (!injury) return null;

  const description = formatInjuryDescription(injury);
  const expectedReturn = formatExpectedReturn(injury.expectedReturn);

  return (
    <div role="group" aria-label="Injury status" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${getSeverityPillClass(injury.severity)}`}
      >
        {formatInjuryStatus(injury)}
      </span>
      {description && <span className="text-[12px] text-landing-ink">{description}</span>}
      {expectedReturn && <span className="text-[11.5px] text-locker-ink-muted">{expectedReturn}</span>}
      <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">{INJURY_SOURCE_CREDIT}</span>
    </div>
  );
}
