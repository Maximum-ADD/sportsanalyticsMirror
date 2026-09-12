import { MaybeLink } from "./MaybeLink";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { TeamBadge } from "@/components/TeamBadge";
import { LockerSection } from "./LockerSection";
import type { RecentView } from "./placeholderData";

interface JumpBackInRailProps {
  views: RecentView[];
}

// The only module that personalizes with zero user effort, which makes it
// the safety net for an account that has followed nothing yet. Hidden
// entirely at zero rows rather than rendered as an empty scroller.
export function JumpBackInRail({ views }: JumpBackInRailProps) {
  if (views.length === 0) return null;

  return (
    <LockerSection title="Jump back in">
      <ul className="flex flex-wrap gap-1.5">
        {views.map((view) => (
          <li key={view.id}>
            <MaybeLink
              to={view.href}
              className="inline-flex items-center gap-2 border border-landing-light bg-landing-hero py-0.5 pr-2.5 pl-0.5 text-[11.5px] text-landing-ink transition-colors hover:border-locker-leather focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-locker-leather"
            >
              {view.player && (
                <PlayerHeadshot
                  player={view.player}
                  size="sm"
                  className="size-5.5 bg-[#c3bfb9] text-[8px] text-locker-ink-muted"
                />
              )}
              {view.team && <TeamBadge team={view.team} size="sm" className="size-5.5" />}
              {view.label}
              <span className="font-mono text-[8.5px] tracking-[0.14em] text-locker-ink-muted uppercase">
                {view.kind}
                {view.viewCount > 1 && ` ×${view.viewCount}`}
              </span>
            </MaybeLink>
          </li>
        ))}
      </ul>
    </LockerSection>
  );
}
