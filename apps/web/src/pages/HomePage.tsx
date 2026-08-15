import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Free to use under the Unsplash License (no attribution required, credited
// here anyway as courtesy) — chosen instead of the celebrity photography in
// the original reference mockup, which is copyrighted press photography we
// don't have rights to.
const HERO_PHOTO_ID = "photo-1579487685737-e435a87b2518";
const HERO_PHOTO_CREDIT = { name: "Logan Weaver", url: "https://unsplash.com/@lgnwvr" };

// The source is a portrait photo (2080x3120) — these crop it to a
// landscape hero frame (3:2) at each breakpoint via Unsplash's own
// on-the-fly resizing, rather than shipping locally-built responsive
// assets: no binary files in the repo, and no risk of quietly re-baking in
// an unlicensed image the way a local export pipeline could.
const HERO_WIDTHS = [640, 960, 1440, 1920] as const;
const HERO_IMAGE_QUALITY = 70;

function heroSrcSet(format: "avif" | "webp" | "jpg"): string {
  return HERO_WIDTHS.map((width) => {
    const height = Math.round((width * 2) / 3);
    return `https://images.unsplash.com/${HERO_PHOTO_ID}?fm=${format}&q=${HERO_IMAGE_QUALITY}&w=${width}&h=${height}&fit=crop&auto=format ${width}w`;
  }).join(", ");
}

const HERO_FALLBACK_SRC = `https://images.unsplash.com/${HERO_PHOTO_ID}?fm=jpg&q=${HERO_IMAGE_QUALITY}&w=1920&h=1280&fit=crop&auto=format`;

// Approximates a basketball's pebbled leather grain as a repeating dot
// pattern, layered under the button's solid brand-accent background.
const BASKETBALL_TEXTURE_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.25) 1px, transparent 0)",
  backgroundSize: "6px 6px",
};

export function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <picture>
        <source type="image/avif" srcSet={heroSrcSet("avif")} sizes="100vw" />
        <source type="image/webp" srcSet={heroSrcSet("webp")} sizes="100vw" />
        <img
          src={HERO_FALLBACK_SRC}
          // Decorative — the <h1> below names this region, so a screen
          // reader doesn't need a separate description of the photo.
          alt=""
          width={1920}
          height={1280}
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
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
          <h1 className="font-display text-[clamp(2.75rem,6.5vw,5.5rem)] leading-[0.95] font-semibold tracking-tight uppercase">
            <span className="block text-brand-accent">Sports</span>
            <span className="block text-text-primary">Analytics</span>
            <span className="hero-outline-text block">Platform</span>
          </h1>
          <p className="mt-6 max-w-md text-sm text-text-secondary">
            Browse teams and players and see season stats derived from game
            event data — every number traces back to the events that
            produced it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="group" style={BASKETBALL_TEXTURE_STYLE}>
              <Link to="/players">
                Get Started
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
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
