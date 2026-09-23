import { Link } from "react-router-dom";
import { MyProspectCard } from "@/components/becomepro/MyProspectCard";
import { ProspectDirectory } from "@/components/becomepro/ProspectDirectory";
import { ProspectLeaderboard } from "@/components/becomepro/ProspectLeaderboard";
import { Reveal } from "@/components/landing/Reveal";
import { useMe } from "@/lib/useMe";

// The Become Pro hub.
//
// Public on purpose — the same reasoning AnalyticsController gives for the
// accuracy board ("a leaderboard nobody can see until they sign in is not a
// leaderboard"). A signed-out visitor sees the board, the directory and the
// explainer; only the write affordances are gated, and they are gated inside
// the components rather than by the router.
//
// Compositional by design: every module below owns its own request, loading
// state, error state and empty state, so this file has almost no branching of
// its own. That is the same shape HomePage has, and it is what keeps the
// page's branch coverage reachable.
export function BecomeProPage() {
  const { data: me, session } = useMe();

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Reveal>
          <div className="border border-landing-light bg-locker-surface p-4 sm:p-6">
            <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">
              Become Pro
            </h1>
            <p className="mt-2 max-w-2xl text-[12.5px] text-locker-ink-muted">
              Log your own games and see what the season projects to against the NBA rookie salary
              scale. Every figure here is self-reported by the player it belongs to.
            </p>
            {!session && (
              <p className="mt-3 text-[12.5px] text-locker-ink-muted">
                Sign in to log a season of your own.
              </p>
            )}
            {/* A signed-in account with no username cannot be ranked, because
                the board identifies every prospect by one. Sending them to
                finish onboarding is more use than a form whose result could
                not be keyed. */}
            {session && me && !me.username && (
              <p className="mt-3 text-[12.5px] text-locker-ink-muted">
                <Link to="/onboarding" className="underline hover:text-landing-ink">
                  Finish setting up your profile
                </Link>{" "}
                to log a season — the board lists prospects by username.
              </p>
            )}
          </div>
        </Reveal>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-8">
            <Reveal>
              <ProspectLeaderboard />
            </Reveal>
            <Reveal delay={1}>
              <ProspectDirectory />
            </Reveal>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <Reveal delay={1}>
              <MyProspectCard />
            </Reveal>
            <Reveal delay={2}>
              <HowItWorks />
            </Reveal>
          </div>
        </div>
      </div>
    </div>
  );
}

// A <details> rather than a modal or a separate page: the explanation matters
// enough to be one tap away from every figure, and not enough to push the
// board below the fold.
function HowItWorks() {
  return (
    <details className="border border-landing-light bg-locker-surface p-4">
      <summary className="cursor-pointer font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
        How the valuation works
      </summary>
      <div className="mt-3 space-y-2.5 text-[11.5px] text-locker-ink-muted">
        <p>
          You log a box score per game. The season line is derived from those games — it is never
          typed in directly — the same way every NBA figure on this site is derived from per-play
          records.
        </p>
        <p>
          A model maps that line onto a projected <strong className="text-landing-ink">draft slot</strong>,
          adjusting for the level you played at. The slot is what the model actually predicts; the
          dollar figure is the published NBA rookie salary scale&rsquo;s value for that pick.
        </p>
        <p>
          It is a projection of a rookie-scale salary, not an offer, not a market price, and not a
          claim about what any team would pay. Figures are self-reported, and the reliability score
          says how much of a season is backed by documents an admin has checked.
        </p>
        <p>
          No language model is involved anywhere in the calculation — it is a statistical model
          fitted on real NBA rookie production and draft position.
        </p>
      </div>
    </details>
  );
}
