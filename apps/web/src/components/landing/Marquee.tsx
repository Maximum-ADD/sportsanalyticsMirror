import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ReelVariant = "symbiote" | "crystal";

const VARIANTS: Record<ReelVariant, { band: string; item: string; separator: ReactNode }> = {
  symbiote: {
    band: "reel-symbiote",
    item: "text-sm font-semibold tracking-[0.18em] uppercase",
    separator: (
      <span className="block h-4 w-px bg-gradient-to-b from-transparent via-white/45 to-transparent" />
    ),
  },
  crystal: {
    band: "reel-crystal",
    item: "text-sm font-medium tracking-[0.06em]",
    separator: <span className="block size-1.5 rotate-45 bg-white/55" />,
  },
};

interface MarqueeProps {
  items: string[];
  label: string;
  variant: ReelVariant;
}

export function Marquee({ items, label, variant }: MarqueeProps) {
  const style = VARIANTS[variant];

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
              <Fragment key={item}>
                <li className={cn("px-8 whitespace-nowrap", style.item)}>{item}</li>
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
