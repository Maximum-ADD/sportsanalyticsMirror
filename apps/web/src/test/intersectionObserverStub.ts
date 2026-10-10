import { act } from "react";
import { vi } from "vitest";

type IntersectionChangeHandler = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

/**
 * Installs a global IntersectionObserver stub and returns a handle for
 * firing intersections manually. jsdom implements no IntersectionObserver,
 * so this is the only way a test can drive the observer path (as opposed
 * to the no-observer fallback) — including exits, which the real observer
 * reports and the stub must be able to imitate for replay-mode hooks.
 */
export function installIntersectionObserverStub() {
  let observeCallback: IntersectionChangeHandler | null = null;

  class StubIntersectionObserver {
    constructor(callback: IntersectionChangeHandler) {
      observeCallback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);

  return {
    /** Fires the installed observer's callback as if the browser reported an intersection change. */
    reportIntersection(isIntersecting: boolean) {
      const stubObserver = {} as IntersectionObserver;
      act(() => {
        observeCallback!([{ isIntersecting } as IntersectionObserverEntry], stubObserver);
      });
    },
  };
}
