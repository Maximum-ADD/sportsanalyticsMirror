import { useEffect, useRef, useState } from "react";

// How much of the element must be on screen before its animations fire —
// enough that the section is genuinely in view, not just its top edge
// peeking in from below the fold.
const IN_VIEW_THRESHOLD = 0.2;

export interface UseInViewOptions {
  /**
   * Keep observing after the first entry: leaving the viewport flips
   * `isInView` back to false, so the caller's entrance animation replays
   * the next time the element scrolls back in. Default is one-shot —
   * the observer disconnects as soon as it first reports an intersection.
   */
  replay?: boolean;
}

/**
 * Observes one element and reports whether it is in the viewport.
 *
 * One-shot mode (the default) flips `isInView` to true the first time the
 * element scrolls into view and stays true afterwards — right for entrances
 * that should play once per visit. Replay mode keeps the observer running,
 * so `isInView` tracks the element in both directions and an element
 * returning to the viewport can animate in again.
 *
 * Where IntersectionObserver doesn't exist (jsdom, the component-test
 * environment) the hook reports in-view immediately after mount, so
 * content renders in its final animated state and stays testable.
 */
export function useInView<T extends Element>({ replay = false }: UseInViewOptions = {}) {
  const elementRef = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsInView(true);
            // One-shot callers only ever animate in, so the observer's job
            // is done; replay callers keep watching for the exit that
            // resets them.
            if (!replay) {
              observer.disconnect();
            }
          } else if (replay) {
            setIsInView(false);
          }
        }
      },
      { threshold: IN_VIEW_THRESHOLD }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [replay]);

  return { elementRef, isInView };
}
