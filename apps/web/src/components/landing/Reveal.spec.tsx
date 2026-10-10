import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";
import { installIntersectionObserverStub } from "@/test/intersectionObserverStub";

describe("Reveal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders its content in the risen state when no observer exists", () => {
    // jsdom implements no IntersectionObserver — the same fallback very old
    // browsers rely on: content appears with its animation classes applied.
    render(<Reveal className="mt-4">Stadium lights</Reveal>);

    const revealed = screen.getByText("Stadium lights");
    expect(revealed).toHaveClass("landing-rise");
    expect(revealed).toHaveClass("mt-4");
  });

  it("waits off-screen in the keyframe's first pose, then rises on entry and stays risen (default, one-shot)", () => {
    const observerStub = installIntersectionObserverStub();

    render(
      <Reveal as="h2" delay={2}>
        Fourth Quarter
      </Reveal>
    );
    const headline = screen.getByRole("heading", { level: 2, name: "Fourth Quarter" });

    // Before any intersection: the same pose the rise animation starts
    // from, so handing off to the animation never snaps between states.
    expect(headline).toHaveClass("opacity-0", "translate-y-6");

    observerStub.reportIntersection(true);
    expect(headline).toHaveClass("landing-rise-delay-2");

    // A section that has already risen must not flip back to hidden on a
    // later layout shift or partial exit — that's the "glitch" this default
    // exists to prevent (e.g. new content mounting below it during scroll).
    observerStub.reportIntersection(false);
    expect(headline).toHaveClass("landing-rise-delay-2");
  });

  it("replays the entrance on every re-entry when replay is explicitly requested", () => {
    const observerStub = installIntersectionObserverStub();

    render(
      <Reveal as="h2" delay={2} replay>
        Fourth Quarter
      </Reveal>
    );
    const headline = screen.getByRole("heading", { level: 2, name: "Fourth Quarter" });

    expect(headline).toHaveClass("opacity-0", "translate-y-6");

    observerStub.reportIntersection(true);
    expect(headline).toHaveClass("landing-rise-delay-2");

    // Scrolling away resets the pose; coming back replays the entrance —
    // the landing page's deliberate marketing flourish.
    observerStub.reportIntersection(false);
    expect(headline).toHaveClass("opacity-0", "translate-y-6");

    observerStub.reportIntersection(true);
    expect(headline).toHaveClass("landing-rise-delay-2");
  });
});
