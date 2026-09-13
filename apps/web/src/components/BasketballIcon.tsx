import { useId } from "react";
import type { SVGProps } from "react";

// Radial shading (a lit highlight fading to a burnt-orange edge) plus a
// glossy specular ellipse — the pair of cues that read as "a lit sphere"
// rather than a flat orange disc — on top of the original seam artwork.
export function BasketballIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const gradientId = useId();
  const glareId = useId();

  return (
    <svg viewBox="0 0 24 24" className={className} {...props}>
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffb066" />
          <stop offset="45%" stopColor="var(--color-brand-accent)" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
        <radialGradient id={glareId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff7ed" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#fff7ed" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="12" cy="12" r="10" fill={`url(#${gradientId})`} />

      <g fill="none" stroke="#431407" strokeWidth="0.9" strokeLinecap="round" opacity="0.8">
        <path d="M12 2v20" />
        <path d="M2 12h20" />
        <path d="M12 2c-6 3-6 17 0 20" />
        <path d="M12 2c6 3 6 17 0 20" />
      </g>

      {/* Rim shading — defines the edge against similarly coloured cards. */}
      <circle cx="12" cy="12" r="9.85" fill="none" stroke="#1a1005" strokeOpacity="0.35" strokeWidth="0.3" />

      <ellipse
        cx="8.5"
        cy="7.5"
        rx="3.2"
        ry="2.1"
        fill={`url(#${glareId})`}
        transform="rotate(-25 8.5 7.5)"
      />
    </svg>
  );
}
