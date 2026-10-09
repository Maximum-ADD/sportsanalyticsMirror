import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { fetchTeamInjuries, type PlayerInjury } from "@/lib/injuriesApi";
import {
  formatExpectedReturn,
  formatInjuryDate,
  formatInjuryDescription,
  formatInjuryStatus,
  getSeverityPillClass,
  INJURY_SOURCE_CREDIT,
} from "@/lib/injuryDisplay";

const META_CLASS = "font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase";

function InjuryRow({ injury }: { injury: PlayerInjury }) {
  const description = formatInjuryDescription(injury);
  const expectedReturn = formatExpectedReturn(injury.expectedReturn);

  return (
    <li className="border-b border-landing-light px-3 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {injury.playerId ? (
          <Link to={`/players/${injury.playerId}`} className="text-[13px] text-landing-ink hover:text-locker-leather">
            {injury.playerName}
          </Link>
        ) : (
          <span className="text-[13px] text-landing-ink">{injury.playerName}</span>
        )}
        <span
          className={`px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${getSeverityPillClass(injury.severity)}`}
        >
          {formatInjuryStatus(injury)}
        </span>
      </div>
      {description && <div className="mt-1 text-[12px] text-landing-ink">{description}</div>}
      {expectedReturn && <div className="mt-0.5 text-[11.5px] text-locker-ink-muted">{expectedReturn}</div>}
      {injury.note && <p className="mt-1.5 text-[11.5px] leading-relaxed text-locker-ink-muted">{injury.note}</p>}
      {injury.updatedAt && <div className={`mt-1.5 ${META_CLASS}`}>Updated {formatInjuryDate(injury.updatedAt)}</div>}
    </li>
  );
}

/**
 * A team's injured players from ESPN's report, for the team profile page.
 * Has its own loading, empty and unavailable states, so an ESPN outage only
 * ever costs this section, never the page around it.
 */
export function TeamInjuriesSection({ teamId }: { teamId: string }) {
  const injuriesQuery = useQuery({
    queryKey: ["teamInjuries", teamId],
    queryFn: () => fetchTeamInjuries(teamId),
    // ESPN's figures are read at most every half hour by the API, and
    // retrying an outage three times only delays the "unavailable" message.
    retry: false,
  });

  return (
    <section aria-labelledby="team-injuries-heading">
      <h2
        id="team-injuries-heading"
        className="mb-3 font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase"
      >
        Injuries
      </h2>
      <div className="border border-landing-light bg-locker-surface">
        {injuriesQuery.isPending ? (
          <div className="py-8">
            <BasketballSpinner label="Loading injuries" />
          </div>
        ) : injuriesQuery.isError ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-locker-ink-muted">
            The injury report is unavailable right now.
          </p>
        ) : injuriesQuery.data.injuries.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-locker-ink-muted">No injuries reported.</p>
        ) : (
          <ul>
            {injuriesQuery.data.injuries.map((injury) => (
              <InjuryRow key={`${injury.playerName}-${injury.updatedAt}`} injury={injury} />
            ))}
          </ul>
        )}
      </div>
      <p className={`mt-2 ${META_CLASS}`}>{INJURY_SOURCE_CREDIT}</p>
    </section>
  );
}
