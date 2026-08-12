import type { SVGProps } from "react";

// Drawn rather than using the Figma export, which was a 75px raster with a
// machine-stripped background that halos against dark surfaces.
export function FlameBallIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" className={className} {...props}>
      <defs>
        <linearGradient id="flame-ball-blaze" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="55%" stopColor="var(--color-brand-accent)" />
          <stop offset="100%" stopColor="var(--color-brand-accent-soft)" />
        </linearGradient>
      </defs>

      <g fill="url(#flame-ball-blaze)">
        <path d="M12.5 21.5c-2.6 1.2-5.4 1.6-8.4 1.1 2.3 2 5 2.9 8.1 2.6-2.4 1.9-5 3-8 3.3 3.6 1.2 7 .7 10.2-1.4l-1.9-5.6z" />
        <path d="M10.8 17.9c-2.3.3-4.5-.1-6.6-1.2 1.2 2.3 3 3.8 5.5 4.6-2.6.6-5 .4-7.3-.7 1.9 2.4 4.4 3.6 7.5 3.7l1-6.4z" />
      </g>

      <circle cx="19.5" cy="12.5" r="9.5" fill="var(--color-brand-accent)" />
      <g fill="none" stroke="#1a1005" strokeWidth="1" strokeLinecap="round">
        <path d="M19.5 3v19" />
        <path d="M10 12.5h19" />
        <path d="M19.5 3c-5.7 2.8-5.7 16.2 0 19" />
        <path d="M19.5 3c5.7 2.8 5.7 16.2 0 19" />
      </g>
    </svg>
  );
}
