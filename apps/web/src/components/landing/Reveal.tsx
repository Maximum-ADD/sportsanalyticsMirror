import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/useInView";

// Rise utilities must appear as literal strings (not interpolated) for
// Tailwind's source scanner to generate them; they are picked by index at
// runtime.
const RISE_CLASSES = ["landing-rise", "landing-rise-delay-1", "landing-rise-delay-2", "landing-rise-delay-3"] as const;

export type RevealDelay = 0 | 1 | 2 | 3;

// The pose an out-of-view element waits in: identical to the landing-rise
// keyframes' first frame (invisible, lifted 1.5rem), so handing off to the
// animation never snaps between two different hidden states. Under
// prefers-reduced-motion the CSS disables the rise animation itself, which
// leaves the element at its natural visible state the moment it enters —
// content appears without motion either way.
const RISE_WAITING_CLASSES = "opacity-0 translate-y-6";

interface RevealProps {
  /** Stagger step — 0 rises immediately, each step adds 120ms. */
  delay?: RevealDelay;
  /** Element to render; heading-safe tags ("span", "p", "h2", "li") keep the surrounding semantics valid. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps one block of landing-page content so it rises into view when the
 * block enters the viewport — and again every time it re-enters after
 * being scrolled away. Off-screen the element holds the animation's first
 * frame rather than its finished state, which is what makes each return
 * replay the entrance from the top instead of sitting already-visible.
 */
export function Reveal({ delay = 0, as = "div", className, children }: RevealProps) {
  const { elementRef, isInView } = useInView<HTMLElement>({ replay: true });
  const RevealTag = as;

  return (
    <RevealTag
      ref={elementRef}
      className={cn(isInView ? RISE_CLASSES[delay] : RISE_WAITING_CLASSES, className)}
    >
      {children}
    </RevealTag>
  );
}
