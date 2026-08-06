import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BasketballIcon } from "@/components/BasketballIcon";

export function HomePage() {
  return (
    <div className="p-6">
      <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-10">
        {/* Faint center-circle / three-point-arc motif, like the court markings under the arena lights. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border-2 border-brand-accent/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full border-2 border-brand-accent/10"
        />

        <div className="relative">
          <BasketballIcon className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">NBA Analytics Platform</h1>
          <p className="mt-2 max-w-xl text-sm text-text-secondary">
            Browse teams and players and see season stats derived from game event data.
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild>
              <Link to="/players">Browse players</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/teams">Browse teams</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
