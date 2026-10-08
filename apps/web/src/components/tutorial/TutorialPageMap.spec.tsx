import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TutorialMapRegion } from "@/lib/pageTutorial";
import { TutorialPageMap } from "./TutorialPageMap";

const REGIONS: TutorialMapRegion[] = [
  { id: "left-box", label: "Left box", x: 36, y: 18, width: 96, height: 30, sketch: "matchup", calloutSide: "left" },
  { id: "cards", label: "Cards", x: 36, y: 52, width: 96, height: 32, sketch: "player-cards", calloutSide: "left" },
  { id: "right-box", label: "Right box", x: 136, y: 18, width: 48, height: 24, sketch: "rows", calloutSide: "right" },
  { id: "value", label: "Value", x: 136, y: 46, width: 48, height: 18, sketch: "value", calloutSide: "right" },
  { id: "stats", label: "Stats", x: 36, y: 107, width: 148, height: 12, sketch: "stat-blocks", calloutSide: "left" },
  { id: "help", label: "Help", x: 177, y: 111, width: 9, height: 9, sketch: "help-button", calloutSide: "right" },
];

function renderMap(activeRegionId: string | null, stepNumber = 2) {
  return render(
    <TutorialPageMap pageName="test" regions={REGIONS} activeRegionId={activeRegionId} stepNumber={stepNumber} />
  );
}

/** The x/y the arrow ends at — the last pair of numbers in its path. */
function arrowTip(container: HTMLElement): { x: number; y: number } {
  const path = container.querySelector("path[marker-end]")?.getAttribute("d") ?? "";
  const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
}

describe("TutorialPageMap", () => {
  it("draws every region, each sketch kind included, under one accessible name", () => {
    const { container } = renderMap(null);

    expect(screen.getByRole("img", { name: "Map of the test page" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-region-id]")).toHaveLength(REGIONS.length);
    // The "?" region is drawn as the button itself, not as a labelled box.
    expect(screen.queryByText("Help")).not.toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("outlines the whole page with no pointer when no region is active", () => {
    const { container } = renderMap(null);

    expect(container.querySelector("[data-active]")).toBeNull();
    expect(container.querySelector("path[marker-end]")).toBeNull();
    expect(container.querySelector(".opacity-45")).toBeNull();
  });

  it("highlights only the active region and dims the rest", () => {
    const { container } = renderMap("right-box");

    expect(screen.getByRole("img", { name: "Map of the test page, with Right box highlighted" })).toBeInTheDocument();
    const activeRegions = container.querySelectorAll("[data-active]");
    expect(activeRegions).toHaveLength(1);
    expect(activeRegions[0]).toHaveAttribute("data-region-id", "right-box");
    expect(container.querySelectorAll(".opacity-45")).toHaveLength(REGIONS.length - 1);
  });

  it("numbers the pointer's badge with the step", () => {
    renderMap("left-box", 7);

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  // The arrow has to land on the section's near edge, level with its middle,
  // and stop just short of it — otherwise it points at the wrong neighbour.
  it("points into a left-side region from the left, ending just short of its left edge", () => {
    const { container } = renderMap("left-box");
    const tip = arrowTip(container);

    expect(tip.y).toBe(18 + 30 / 2);
    expect(tip.x).toBeLessThan(36);
    expect(tip.x).toBeGreaterThan(34);
  });

  it("points into a right-side region from the right, ending just short of its right edge", () => {
    const { container } = renderMap("right-box");
    const tip = arrowTip(container);

    expect(tip.y).toBe(18 + 24 / 2);
    expect(tip.x).toBeGreaterThan(136 + 48);
    expect(tip.x).toBeLessThan(136 + 48 + 2);
  });

  it("references an arrowhead that exists in the same drawing", () => {
    const { container } = renderMap("cards");

    const markerReference = container.querySelector("path[marker-end]")?.getAttribute("marker-end") ?? "";
    const markerId = markerReference.slice("url(#".length, -")".length);
    expect(markerId).not.toBe("");
    expect(container.querySelector(`marker[id="${markerId}"]`)).not.toBeNull();
  });
});
