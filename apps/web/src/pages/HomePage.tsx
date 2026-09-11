import { AddToLockerCard } from "@/components/home/AddToLockerCard";
import { BeatTheModelCard } from "@/components/home/BeatTheModelCard";
import { JumpBackInRail } from "@/components/home/JumpBackInRail";
import { ModelAccuracyLedger } from "@/components/home/ModelAccuracyLedger";
import { SavedShelfCard } from "@/components/home/SavedShelfCard";
import { WatchlistBoard } from "@/components/home/WatchlistBoard";
import { YourTeamsList } from "@/components/home/YourTeamsList";
import {
  CHALLENGE,
  FOLLOWED_TEAMS,
  RECENT_VIEWS,
  SAVED_COMPARISONS,
  SAVED_LINEUPS,
  TEAM_RESULTS,
  WATCHLIST,
} from "@/components/home/placeholderData";

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
// NOT WIRED TO THE API YET. Every figure comes from
// components/home/placeholderData.ts, which is the single seam to replace
// with a GET /v1/me/dashboard query. Nothing here reads useSession either,
// so the greeting and the record deliberately do not appear.
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
            <BeatTheModelCard challenge={CHALLENGE} />
            <WatchlistBoard entries={WATCHLIST} />
            <YourTeamsList followedTeams={FOLLOWED_TEAMS} results={TEAM_RESULTS} />
          </div>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <AddToLockerCard />
            <JumpBackInRail views={RECENT_VIEWS} />
            <SavedShelfCard comparisons={SAVED_COMPARISONS} lineups={SAVED_LINEUPS} />
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
