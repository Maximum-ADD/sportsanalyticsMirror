import { useEffect, useState } from "react";

const DEFAULT_DURATION_IN_MS = 1100;

/**
 * Animates a number from 0 up to `target` while `active` is true, easing
 * out (cubic) so the final digits settle rather than snap. Deactivating
 * rewinds the count to zero, so a caller whose section left and re-entered
 * the viewport counts up from the top again.
 *
 * Falls back to the final value immediately whenever the count can't be
 * animated: no requestAnimationFrame (jsdom without pretendToBeVisual) or a
 * prefers-reduced-motion user. A later `target` change restarts the count
 * from wherever it currently stands.
 */
export function useCountUp(target: number, active: boolean, durationInMilliseconds = DEFAULT_DURATION_IN_MS): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }

    let frameHandle = 0;
    const startTimestamp = performance.now();

    // Progress is measured with performance.now() at both ends rather than
    // the timestamp requestAnimationFrame passes in. In a browser the two
    // share a clock, but jsdom's frame timestamps start from a different
    // origin, which stretched this 1.1 s count to ~16 s under test and past
    // the 25 s wait limit when the whole suite ran with coverage.
    function advance() {
      const progress = Math.min((performance.now() - startTimestamp) / durationInMilliseconds, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * easedProgress));
      if (progress < 1) {
        frameHandle = requestAnimationFrame(advance);
      }
    }

    frameHandle = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frameHandle);
  }, [active, target, durationInMilliseconds]);

  return value;
}
