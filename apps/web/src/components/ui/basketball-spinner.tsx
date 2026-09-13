import type { CSSProperties } from "react";
import { BasketballIcon } from "@/components/BasketballIcon";
import { cn } from "@/lib/utils";

type BasketballSpinnerSize = "sm" | "md" | "lg";

const BALL_SIZE_CLASSES: Record<BasketballSpinnerSize, string> = {
  sm: "size-6",
  md: "size-10",
  lg: "size-16",
};

// How high the ball jumps above its resting line, in absolute units rather
// than a percentage of its own size — a size proportional to the ball would
// either read as barely-there at "sm" or blow out of tight containers (the
// navbar widget) at "lg".
const BOUNCE_HEIGHT: Record<BasketballSpinnerSize, string> = {
  sm: "0.75rem",
  md: "1.5rem",
  lg: "2.5rem",
};

const SHADOW_WIDTH_CLASSES: Record<BasketballSpinnerSize, string> = {
  sm: "w-4",
  md: "w-7",
  lg: "w-10",
};

interface BasketballSpinnerProps {
  className?: string;
  size?: BasketballSpinnerSize;
  // Accessible name announced to screen readers while the spinner is
  // visible — not shown on screen, the bounce already reads as "loading".
  label?: string;
}

// Drop-in loading indicator used wherever a whole section is waiting on
// data, in place of Skeleton (which stands in for a specific content shape
// rather than signalling "fetching"). The ball, its roll and the shadow
// beneath all run on the same cycle (see the basketball-* keyframes in
// index.css) so they read as one physical object bouncing, not three
// independent animations.
export function BasketballSpinner({ className, size = "md", label = "Loading" }: BasketballSpinnerProps) {
  const bounceStyle = { "--basketball-bounce-height": BOUNCE_HEIGHT[size] } as CSSProperties;

  return (
    <div role="status" aria-label={label} className={cn("flex flex-col items-center gap-1.5", className)}>
      <div style={bounceStyle} className={cn(BALL_SIZE_CLASSES[size], "animate-basketball-bounce")}>
        <BasketballIcon className="size-full animate-basketball-spin" />
      </div>
      <div className="relative flex h-1.5 items-center justify-center">
        <div
          aria-hidden="true"
          className={cn(
            SHADOW_WIDTH_CLASSES[size],
            "absolute h-1.5 rounded-full bg-black/60 blur-[1.5px] animate-basketball-shadow"
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            SHADOW_WIDTH_CLASSES[size],
            "absolute aspect-square rounded-full border border-brand-accent animate-basketball-impact"
          )}
        />
      </div>
    </div>
  );
}
