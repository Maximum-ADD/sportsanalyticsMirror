import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroCourtLines } from "./HeroCourtLines";

// The boundary outline the comet laps — must match the path in the
// component, since the comet's dash period is tuned to its perimeter.
const COURT_BOUNDARY_PATH = "M 0 470 L 0 0 L 500 0 L 500 470 Z";

/** The six draw-in markings: five paths plus the free-throw circle. */
function selectDrawnMarkings(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGElement>("path, circle")).filter(
    (element) => element.getAttribute("pathLength") === "1"
  );
}

describe("HeroCourtLines", () => {
  it("is purely decorative — one aria-hidden container around the diagram", () => {
    const { container } = render(<HeroCourtLines />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("draws every court line in once in view", () => {
    const { container } = render(<HeroCourtLines />);

    // jsdom has no IntersectionObserver, so the hook reports in-view
    // immediately: each normalized line (pathLength 1) sits at dash
    // offset 0 — fully drawn — rather than still waiting at 1.
    const markings = selectDrawnMarkings(container);
    expect(markings).toHaveLength(6);
    for (const marking of markings) {
      expect(marking).toHaveAttribute("stroke-dasharray", "1 1");
      expect(marking).toHaveAttribute("stroke-dashoffset", "0");
    }
  });

  it("runs a subtle comet around the boundary, faded in with the court drawn", () => {
    const { container } = render(<HeroCourtLines />);

    // Two comet passes (soft glow under a bright core) share the outline.
    const comets = container.querySelectorAll<SVGPathElement>(".hero-court-pulse");
    expect(comets).toHaveLength(2);
    for (const comet of Array.from(comets)) {
      expect(comet).toHaveAttribute("d", COURT_BOUNDARY_PATH);
      // 40-unit comet + 1900-unit gap = 1940, the outline's perimeter —
      // the equality that makes each animation cycle one seamless lap.
      expect(comet).toHaveAttribute("stroke-dasharray", "40 1900");
      expect(comet).toHaveClass("stroke-brand-accent");
    }

    // The comet rides in a group that fades up once the lines have drawn.
    const cometGroup = comets[0].closest("g");
    expect(cometGroup).toHaveClass("opacity-100");
  });

  it("keeps the drawn court static — only the comet moves", () => {
    const { container } = render(<HeroCourtLines />);

    for (const marking of selectDrawnMarkings(container)) {
      expect(marking).not.toHaveClass("hero-court-pulse");
    }
  });
});
