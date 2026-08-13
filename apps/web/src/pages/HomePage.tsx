import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

// Free to use under the Unsplash License (no attribution required, credited
// here anyway as courtesy) — chosen instead of the celebrity photography in
// the original reference mockup, which is copyrighted press photography we
// don't have rights to.
const HERO_PHOTO_URL =
  "https://images.unsplash.com/photo-1579487685737-e435a87b2518?fm=jpg&q=80&w=1920&auto=format&fit=crop";
const HERO_PHOTO_CREDIT = { name: "Logan Weaver", url: "https://unsplash.com/@lgnwvr" };

// Approximates a basketball's pebbled leather grain as a repeating dot
// pattern, layered under the button's solid brand-accent background.
const BASKETBALL_TEXTURE_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.25) 1px, transparent 0)",
  backgroundSize: "6px 6px",
};

export function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <img
        src={HERO_PHOTO_URL}
        alt="A basketball player dunking in front of a crowd"
        className="absolute inset-0 size-full object-cover"
      />
      {/* Dark gradient so the headline stays legible over the photo — fades
          from opaque on the left (where the text sits) to lighter on the
          right (where the photo itself should read clearly). */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-surface-base via-surface-base/85 to-surface-base/30"
      />

      {/* Faint center-circle / three-point-arc motifs, like court markings under arena lights. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full border-2 border-brand-accent/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/3 size-80 rounded-full border-2 border-brand-accent/10"
      />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-2 lg:py-32">
        <div>
          <h1 className="text-5xl leading-[0.95] font-black tracking-tight uppercase sm:text-6xl">
            <span className="block text-brand-accent">Sports</span>
            <span className="block text-text-primary">Analytics</span>
            <span className="block text-text-muted">Platform</span>
          </h1>
          <p className="mt-6 max-w-md text-sm text-text-secondary">
            Browse teams and players and see season stats derived from game
            event data — every number traces back to the events that
            produced it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" style={BASKETBALL_TEXTURE_STYLE}>
              <Link to="/players">Get Started</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/teams">Browse teams</Link>
            </Button>
          </div>
        </div>

        {/* Geometric accent panels on the right, echoing the reference design's stacked shapes. */}
        <div className="relative hidden h-72 lg:block">
          <div aria-hidden className="absolute right-4 top-4 size-40 rounded-2xl bg-brand-accent/20 backdrop-blur-sm" />
          <div aria-hidden className="absolute right-16 top-20 size-36 rounded-2xl bg-brand-accent/35 backdrop-blur-sm" />
          <div
            aria-hidden
            className="absolute bottom-0 right-0 size-44 rounded-2xl bg-brand-accent-soft/50 backdrop-blur-sm"
          />
        </div>
      </div>

      <a
        href={HERO_PHOTO_CREDIT.url}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-3 text-[10px] text-text-muted/70 hover:text-text-muted"
      >
        Photo: {HERO_PHOTO_CREDIT.name} / Unsplash
      </a>
    </div>
  );
}
