import { BeatTheModelCard } from "@/components/home/BeatTheModelCard";
import { LeaderboardCard } from "@/components/home/LeaderboardCard";
import { ModelAccuracyLedger } from "@/components/home/ModelAccuracyLedger";
import { SavedShelfCard } from "@/components/home/SavedShelfCard";
import { WatchlistBoard } from "@/components/home/WatchlistBoard";
import { YourTeamsList } from "@/components/home/YourTeamsList";

// "The Locker" — the signed-in home page.
//
// Built on the LANDING page's palette (landing-hero / landing-light /
// landing-accent / leather-texture) rather than the dark app shell, so
// signing in reads as walking further into the same building. That is a
// deliberate seam: /players, /teams, /compare and /optimizer are all still
// on surface-base, so this page currently looks unlike the rest of the app.
// Either migrate those too or keep /home as a light "front of house" — but
// make it a decision rather than a drift.
//
// Three structural rules exist to stop this page reading as a second
// landing hero, which is why "Get Started" felt like it did nothing: no
// photograph, nothing viewport-filling, and no control anywhere behind the
// app shell labelled "Get Started". The old hero here was a near
// point-for-point rebuild of LandingPage's, which is the whole bug.
//
// FULLY WIRED. Every module on this page reads the live API — Beat the Model,
// the watchlist board, your team's results, the saved shelf, the accuracy
// leaderboard and the model accuracy ledger. components/home/placeholderData.ts
// is gone: there is no invented figure anywhere behind this route, and each
// module says so itself when it has nothing real to show rather than falling
// back on a plausible-looking number.
//
// AddToLockerCard and JumpBackInRail are deliberately NOT rendered here. Both
// were pure layout with nothing behind them — Add To Locker searched nothing
// and Jump Back In listed views no one had recorded — so they are off the page
// until there is something real for them to do. The components are kept rather
// than deleted: Add To Locker returns when there is a search endpoint behind
// it, and Jump Back In when view history is actually stored.
export function HomePage() {
  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 py-6 lg:px-8">
        {/* TODO(onboarding): a brand-new account needs the three-step "Set up
            your locker" strip here — claim a team, follow three players, make
            one call — so the page assembles itself instead of opening on
            empty modules. It is conditional on row counts, so it needs the
            API first. */}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-8">
            <BeatTheModelCard />
            <WatchlistBoard />
            <YourTeamsList />
          </div>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <LeaderboardCard />
            <SavedShelfCard />
          </div>
        </div>

        <div className="border-t-2 border-landing-light pt-5">
          <p className="mb-4 font-mono text-[10px] tracking-[0.2em] text-locker-ink-muted uppercase">
            Published figures — identical for every account
          </p>
          <ModelAccuracyLedger />
        </div>
      </div>
    </div>
  );
}
