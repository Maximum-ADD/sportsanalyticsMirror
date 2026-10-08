import { describe, expect, it } from "vitest";
import { TUTORIAL_PAGE_FRAME } from "@/lib/pageTutorial";
import { ALL_PAGE_TUTORIALS } from "./allPageTutorials";

// Tutorials are data, so nothing but these checks stops a typo in a region
// id from silently drawing a step with nothing highlighted, or a region from
// spilling out of the drawn page into the strips the badges sit in.

// Mirrors the API's isValidTutorialId (apps/api/src/me/me.service.ts): an id
// the API rejects could never be marked seen, so the tutorial would open on
// every visit.
const API_TUTORIAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const API_MAX_TUTORIAL_ID_LENGTH = 64;

describe("ALL_PAGE_TUTORIALS", () => {
  // Two pages sharing an id would share one "seen" row: seeing either would
  // silently spend the other.
  it("gives every tutorial its own id", () => {
    const tutorialIds = ALL_PAGE_TUTORIALS.map((tutorial) => tutorial.id);

    expect(new Set(tutorialIds).size).toBe(tutorialIds.length);
  });
});

describe.each(ALL_PAGE_TUTORIALS.map((tutorial) => [tutorial.id, tutorial] as const))("the %s tutorial", (_, tutorial) => {
  it("has an id the API will accept", () => {
    expect(tutorial.id).toMatch(API_TUTORIAL_ID_PATTERN);
    expect(tutorial.id.length).toBeLessThanOrEqual(API_MAX_TUTORIAL_ID_LENGTH);
  });

  it("gives every region a unique id", () => {
    const regionIds = tutorial.regions.map((region) => region.id);

    expect(new Set(regionIds).size).toBe(regionIds.length);
  });

  it("points every step at a region that exists, or at the whole page", () => {
    const regionIds = new Set(tutorial.regions.map((region) => region.id));

    for (const step of tutorial.steps) {
      if (step.regionId !== null) expect(regionIds).toContain(step.regionId);
    }
  });

  it("explains every region it draws", () => {
    const explainedRegionIds = new Set(tutorial.steps.map((step) => step.regionId));

    for (const region of tutorial.regions) {
      expect(explainedRegionIds).toContain(region.id);
    }
  });

  it("opens on the whole page and ends on where to find it again", () => {
    const steps = tutorial.steps;
    const lastRegion = tutorial.regions.find((region) => region.id === steps[steps.length - 1].regionId);

    expect(steps[0].regionId).toBeNull();
    expect(lastRegion?.sketch).toBe("help-button");
  });

  // Titles key the progress dots, and a repeated title would also read as a
  // repeated step.
  it("titles every step uniquely, and gives each something to say", () => {
    const titles = tutorial.steps.map((step) => step.title);

    expect(new Set(titles).size).toBe(titles.length);
    for (const step of tutorial.steps) {
      expect(step.summary.trim()).not.toBe("");
      expect(step.points.length).toBeGreaterThan(0);
    }
  });

  it("keeps every region inside the drawn page", () => {
    const frameRight = TUTORIAL_PAGE_FRAME.x + TUTORIAL_PAGE_FRAME.width;
    const frameBottom = TUTORIAL_PAGE_FRAME.y + TUTORIAL_PAGE_FRAME.height;

    for (const region of tutorial.regions) {
      expect(region.x).toBeGreaterThanOrEqual(TUTORIAL_PAGE_FRAME.x);
      expect(region.y).toBeGreaterThanOrEqual(TUTORIAL_PAGE_FRAME.y);
      expect(region.x + region.width).toBeLessThanOrEqual(frameRight);
      expect(region.y + region.height).toBeLessThanOrEqual(frameBottom);
    }
  });
});
