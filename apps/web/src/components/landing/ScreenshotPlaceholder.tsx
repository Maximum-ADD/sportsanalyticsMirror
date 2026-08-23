import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface ScreenshotPlaceholderProps {
  ratio: number;
  label: string;
  src?: string;
  className?: string;
  style?: CSSProperties;
}

export function ScreenshotPlaceholder({
  ratio,
  label,
  src,
  className,
  style,
}: ScreenshotPlaceholderProps) {
  return (
    <div
      data-testid="screenshot-placeholder"
      className={cn(
        "overflow-hidden border border-landing-placeholder-edge/60 bg-landing-placeholder shadow-[0_14px_34px_rgba(0,0,0,0.32)]",
        className
      )}
      style={{ ...style, aspectRatio: ratio }}

      aria-hidden={src ? undefined : true}
    >
      {src ? <img src={src} alt={label} className="size-full object-cover object-top" /> : null}
    </div>
  );
}
