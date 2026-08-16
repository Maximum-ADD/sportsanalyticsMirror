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

const HERO_WIDTHS = [640, 960, 1440, 1920] as const;
const HERO_IMAGE_QUALITY = 70;

function heroSrcSet(format: "avif" | "webp" | "jpg"): string {
  return HERO_WIDTHS.map((width) => {
    const height = Math.round((width * 2) / 3);
    return `https://images.unsplash.com/${HERO_PHOTO_ID}?fm=${format}&q=${HERO_IMAGE_QUALITY}&w=${width}&h=${height}&fit=crop&auto=format ${width}w`;
  }).join(", ");
}

const HERO_FALLBACK_SRC = `https://images.unsplash.com/${HERO_PHOTO_ID}?fm=jpg&q=${HERO_IMAGE_QUALITY}&w=1920&h=1280&fit=crop&auto=format`;

const BASKETBALL_TEXTURE_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.25) 1px, transparent 0)",
  backgroundSize: "6px 6px",
};

export function HomePage() {
  return (
    <div className="relative overflow-hidden bg-surface-base">
      <picture>
        <source type="image/avif" srcSet={heroSrcSet("avif")} sizes="100vw" />
        <source type="image/webp" srcSet={heroSrcSet("webp")} sizes="100vw" />
        <img
          src={HERO_FALLBACK_SRC}
          alt=""
          width={1920}
          height={1280}
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-center"
        />
      </picture>

      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface-base via-surface-base/85 to-surface-base/35" />
      <div aria-hidden className="pointer-events-none absolute bottom-10 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full border border-white/5" />

      {/* 7rem = navbar's total height (2rem project-name strip + 5rem main bar), so the hero still fills the rest of the viewport. */}
      <div className="relative mx-auto grid min-h-[calc(100vh-7rem)] max-w-[1500px] grid-cols-1 items-center gap-10 px-6 pb-24 pt-14 lg:grid-cols-[1.2fr_0.8fr] lg:gap-6 lg:px-10">
        <div className="z-10 max-w-[760px] pl-0 lg:pl-4">
          <h1 className="font-display text-[clamp(3.5rem,7vw,10rem)] leading-[0.8] tracking-[-0.06em] uppercase">
            <span className="block text-brand-accent">Sports</span>
            <span className="block text-text-primary">Analytics</span>
            <span className="hero-outline-text block">Platform</span>
          </h1>

          <div className="mt-8 flex max-w-[420px] justify-start">
            <Button asChild size="lg" className="group h-16 rounded-none border-0 px-8 text-2xl font-medium" style={BASKETBALL_TEXTURE_STYLE}>
              <Link to="/players" className="flex items-center gap-3">
                <span>Get Started</span>
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative hidden h-[30rem] items-end justify-end lg:flex">
          <div className="absolute left-10 top-8 h-24 w-56 rounded-none bg-accent-panel-light shadow-[0_10px_25px_rgba(0,0,0,0.25)]" />
          <div className="absolute left-0 bottom-20 h-40 w-64 rounded-none bg-accent-panel-mid shadow-[0_10px_25px_rgba(0,0,0,0.28)]" />
          <div className="absolute right-0 bottom-8 h-28 w-48 rounded-none bg-accent-panel-dark shadow-[0_10px_25px_rgba(0,0,0,0.28)]" />
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
