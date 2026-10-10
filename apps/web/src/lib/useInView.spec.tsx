import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInView, type UseInViewOptions } from "./useInView";
import { installIntersectionObserverStub } from "@/test/intersectionObserverStub";

/**
 * Renders a div wired to the hook, mirroring `isInView` as its text.
 * `renderHook` alone cannot exercise the observer path: nothing attaches
 * `elementRef` to a real DOM node, and the hook deliberately treats a
 * missing element as "show the final state".
 */
function renderInViewProbe(options?: UseInViewOptions) {
  function InViewProbe() {
    const { elementRef, isInView } = useInView<HTMLDivElement>(options);
    return <div ref={elementRef}>{isInView ? "in view" : "hidden"}</div>;
  }

  render(<InViewProbe />);
}

describe("useInView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports in view immediately when IntersectionObserver is unavailable", async () => {
    // jsdom implements no IntersectionObserver — the same fallback very old
    // browsers (and every test render) rely on: content must render in its
    // final animated state rather than wait forever for an observer.
    renderInViewProbe();

    expect(await screen.findByText("in view")).toBeInTheDocument();
  });

  it("flips to in view only once the observer reports an intersection", () => {
    const observerStub = installIntersectionObserverStub();
    renderInViewProbe();
    expect(screen.getByText("hidden")).toBeInTheDocument();

    observerStub.reportIntersection(true);

    expect(screen.getByText("in view")).toBeInTheDocument();
  });

  it("stays hidden while the observer only reports non-intersections", () => {
    const observerStub = installIntersectionObserverStub();
    renderInViewProbe();

    observerStub.reportIntersection(false);

    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("keeps a one-shot observer's element visible after a later exit", () => {
    // One-shot is the default: the observer disconnects at the first
    // intersection, so no exit is ever reported and the element stays up.
    const observerStub = installIntersectionObserverStub();
    renderInViewProbe();

    observerStub.reportIntersection(true);
    observerStub.reportIntersection(false);

    expect(screen.getByText("in view")).toBeInTheDocument();
  });

  it("re-hides and re-reveals when a replay observer reports exits and re-entries", () => {
    const observerStub = installIntersectionObserverStub();
    renderInViewProbe({ replay: true });
    expect(screen.getByText("hidden")).toBeInTheDocument();

    observerStub.reportIntersection(true);
    expect(screen.getByText("in view")).toBeInTheDocument();

    // Leaving the viewport resets the element so its entrance can replay.
    observerStub.reportIntersection(false);
    expect(screen.getByText("hidden")).toBeInTheDocument();

    observerStub.reportIntersection(true);
    expect(screen.getByText("in view")).toBeInTheDocument();
  });
});
