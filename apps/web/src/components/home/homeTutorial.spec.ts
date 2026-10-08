import { describe, expect, it } from "vitest";
import { TUTORIAL_PAGE_FRAME } from "@/lib/pageTutorial";
import { HOME_TUTORIAL, HOME_TUTORIAL_ID } from "./homeTutorial";

// The tutorial is data, so nothing but these checks stops a typo in a region
// id from silently drawing a step with nothing highlighted, or a region from
// spilling out of the drawn page into the strips the badges sit in.

// Mirrors the API's isValidTutorialId (apps/api/src/me/me.service.ts): an id
// the API rejects could never be marked seen, so the tutorial would open on
// every visit.
const API_TUTORIAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const API_MAX_TUTORIAL_ID_LENGTH = 64;

describe("HOME_TUTORIAL", () => {
  it("has an id the API will accept", () => {
    expect(HOME_TUTORIAL.id).toBe(HOME_TUTORIAL_ID);
    expect(HOME_TUTORIAL.id).toMatch(API_TUTORIAL_ID_PATTERN);
    expect(HOME_TUTORIAL.id.length).toBeLessThanOrEqual(API_MAX_TUTORIAL_ID_LENGTH);
  });

  it("gives every region a unique id", () => {
    const regionIds = HOME_TUTORIAL.regions.map((region) => region.id);

    expect(new Set(regionIds).size).toBe(regionIds.length);
  });

  it("points every step at a region that exists, or at the whole page", () => {
    const regionIds = new Set(HOME_TUTORIAL.regions.map((region) => region.id));

    for (const step of HOME_TUTORIAL.steps) {
      if (step.regionId !== null) expect(regionIds).toContain(step.regionId);
    }
  });

  it("explains every region it draws", () => {
    const explainedRegionIds = new Set(HOME_TUTORIAL.steps.map((step) => step.regionId));

    for (const region of HOME_TUTORIAL.regions) {
      expect(explainedRegionIds).toContain(region.id);
    }
  });

  it("opens on the whole page and ends on where to find it again", () => {
    const steps = HOME_TUTORIAL.steps;

    expect(steps[0].regionId).toBeNull();
    expect(steps[steps.length - 1].regionId).toBe("help-button");
  });

  // Titles key the progress dots, and a repeated title would also read as a
  // repeated step.
  it("titles every step uniquely, and gives each something to say", () => {
    const titles = HOME_TUTORIAL.steps.map((step) => step.title);

    expect(new Set(titles).size).toBe(titles.length);
    for (const step of HOME_TUTORIAL.steps) {
      expect(step.summary.trim()).not.toBe("");
      expect(step.points.length).toBeGreaterThan(0);
    }
  });

  it("keeps every region inside the drawn page", () => {
    const frameRight = TUTORIAL_PAGE_FRAME.x + TUTORIAL_PAGE_FRAME.width;
    const frameBottom = TUTORIAL_PAGE_FRAME.y + TUTORIAL_PAGE_FRAME.height;

    for (const region of HOME_TUTORIAL.regions) {
      expect(region.x).toBeGreaterThanOrEqual(TUTORIAL_PAGE_FRAME.x);
      expect(region.y).toBeGreaterThanOrEqual(TUTORIAL_PAGE_FRAME.y);
      expect(region.x + region.width).toBeLessThanOrEqual(frameRight);
      expect(region.y + region.height).toBeLessThanOrEqual(frameBottom);
    }
  });
});
