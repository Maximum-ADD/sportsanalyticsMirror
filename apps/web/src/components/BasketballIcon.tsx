import type { SVGProps } from "react";

export function BasketballIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="var(--color-brand-accent)" />
      <g fill="none" stroke="#1a1005" strokeWidth="1" strokeLinecap="round">
        <path d="M12 2v20" />
        <path d="M2 12h20" />
        <path d="M12 2c-6 3-6 17 0 20" />
        <path d="M12 2c6 3 6 17 0 20" />
      </g>
    </svg>
  );
}
