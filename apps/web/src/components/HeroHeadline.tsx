interface HeroHeadlineProps {
  // A 3-tuple so the three treatments below always have exactly one line each.
  lines: readonly [string, string, string];
}

// Sizing is taken from the Figma frame: 92px cap height at 1884px wide, and
// Oswald's cap height is ~0.73em, so 6.7vw. The clamp floor keeps the longest
// word inside a 320px viewport.
export function HeroHeadline({ lines }: HeroHeadlineProps) {
  const [first, second, third] = lines;

  return (
    <h1 className="font-display text-[clamp(2.75rem,6.7vw,7.875rem)] font-semibold uppercase leading-[0.87] tracking-[0.01em]">
      <span className="block text-brand-accent">{first}</span>
      <span className="block text-text-primary">{second}</span>
      <span className="hero-outline-text block">{third}</span>
    </h1>
  );
}
