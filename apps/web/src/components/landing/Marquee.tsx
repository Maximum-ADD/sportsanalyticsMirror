import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ReelVariant = "symbiote" | "crystal";

export type MarqueeItem = {
  name: string;
  /** Path to the logo under /logos, e.g. "/logos/react.webp". Omitted when we hold no logo for the stack. */
  logo?: string;
};

// Logos sit in a white chip rather than straight on the black band: several
// of the source files carry a baked-in white background, and one uniform
// chip makes those indistinguishable from the transparent ones.
const LOGO_CHIP_CLASSES = "flex size-12 shrink-0 items-center justify-center rounded-lg bg-white p-1.5";
const LOGO_IMAGE_CLASSES = "size-full object-contain";
// A stack with no logo holds a blank slot of the same size so its name
// still lines up with the names beside it.
const EMPTY_LOGO_SLOT_CLASSES = "size-12 shrink-0";
const STACKED_ITEM_CLASSES = "flex flex-col items-center gap-3 px-8 whitespace-nowrap";

const VARIANTS: Record<ReelVariant, { band: string; item: string; separator: ReactNode }> = {
  symbiote: {
    band: "reel-symbiote",
    item: "font-display text-sm font-normal tracking-[0.18em] uppercase",
    separator: (
      <span className="block h-4 w-px bg-gradient-to-b from-transparent via-white/45 to-transparent" />
    ),
  },
  crystal: {
    band: "reel-crystal",
    item: "font-display text-sm font-normal tracking-[0.18em] uppercase",
    separator: <span className="block size-1.5 rotate-45 bg-white/55" />,
  },
};

interface MarqueeProps {
  items: MarqueeItem[];
  label: string;
  variant: ReelVariant;
}

interface MarqueeItemCardProps {
  item: MarqueeItem;
  itemClassName: string;
}

/** One logo-layout entry: the chip (or its blank stand-in) with the stack name beneath it. */
function MarqueeItemCard({ item, itemClassName }: MarqueeItemCardProps) {
  return (
    <li className={STACKED_ITEM_CLASSES}>
      {item.logo ? (
        <span className={LOGO_CHIP_CLASSES}>
          {/* Decorative: the name directly below already identifies the stack. */}
          <img src={item.logo} alt="" className={LOGO_IMAGE_CLASSES} />
        </span>
      ) : (
        <span aria-hidden className={EMPTY_LOGO_SLOT_CLASSES} />
      )}
      <span className={itemClassName}>{item.name}</span>
    </li>
  );
}

export function Marquee({ items, label, variant }: MarqueeProps) {
  const style = VARIANTS[variant];
  // When any item carries a logo the whole reel adopts the stacked layout —
  // every name sits at the same height, logo or not. Name-only reels (the
  // team credits) stay flat on a single line.
  const usesLogoLayout = items.some((item) => item.logo !== undefined);

  return (
    <section
      aria-label={label}
      className={cn("group relative flex overflow-hidden py-4", style.band)}
    >
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            aria-hidden={copy === 1 ? true : undefined}
            className="flex min-w-[100vw] shrink-0 items-center justify-around"
          >
            {items.map((item) => (
              <Fragment key={item.name}>
                {usesLogoLayout ? (
                  <MarqueeItemCard item={item} itemClassName={style.item} />
                ) : (
                  <li className={cn("px-8 whitespace-nowrap", style.item)}>{item.name}</li>
                )}
                <li aria-hidden className="flex shrink-0 items-center">
                  {style.separator}
                </li>
              </Fragment>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
