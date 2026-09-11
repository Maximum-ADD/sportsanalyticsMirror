import { ChevronDown, Search, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LOCKER_SUMMARY } from "./placeholderData";

// The follow primitive kept permanently one click away.
//
// Rendered as inert controls for now: the real version swaps the search box
// for PlayerSearchCombobox and the select for a real <select>, both hitting
// POST /v1/me/follows/*. Worth rebuilding PlayerSearchCombobox to ARIA 1.2
// while it is being touched — the app currently has no role="combobox",
// aria-expanded or aria-activedescendant anywhere.
export function AddToLockerCard() {
  return (
    <Card className="rounded-none border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex items-center gap-3.5">
        <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
          Add to locker
        </h2>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>

      <p className="flex items-center gap-2 border border-landing-light bg-landing-hero px-2.5 py-2 text-[12.5px] text-locker-ink-muted">
        Add a player to your locker
        <Search aria-hidden className="ml-auto size-3.5" />
      </p>

      <div className="mt-2 flex items-center gap-2.5">
        <p className="flex flex-1 items-center gap-2 border border-landing-light bg-landing-hero px-2.5 py-2 text-[12.5px] text-locker-ink-muted">
          {LOCKER_SUMMARY.primaryTeam}
          <ChevronDown aria-hidden className="ml-auto size-3.5" />
        </p>
        <Star aria-hidden className="size-3.5 text-locker-leather" />
        <span className="text-[11px] text-locker-ink-muted">primary</span>
      </div>

      <p className="mt-3 text-[11.5px] text-locker-ink-muted">
        Watching {LOCKER_SUMMARY.players} players · {LOCKER_SUMMARY.teams} teams
      </p>
    </Card>
  );
}
