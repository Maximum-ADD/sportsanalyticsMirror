import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectReliability } from "@/test/becomeProFixtures";
import { ReliabilityMeter } from "./ReliabilityMeter";

describe("ReliabilityMeter", () => {
  it("states the verified fraction in words", () => {
    renderWithProviders(<ReliabilityMeter reliability={makeProspectReliability()} />);

    expect(screen.getByText(/4 of 14 games verified/i)).toBeInTheDocument();
  });

  // The tier has to survive greyscale and a screen reader, so it is a word
  // rather than a count of filled segments.
  it("names the tier in words rather than by colour alone", () => {
    renderWithProviders(
      <ReliabilityMeter reliability={makeProspectReliability({ tier: "STRONG" })} />
    );

    expect(screen.getByText(/well verified/i)).toBeInTheDocument();
  });

  // The likeliest bug in the feature: nothing documented yet is a real
  // measurement of zero, not an absent figure.
  it("shows a zero score as zero when games are on record", () => {
    renderWithProviders(
      <ReliabilityMeter
        reliability={makeProspectReliability({
          score: 0,
          tier: "UNDOCUMENTED",
          gamesVerified: 0,
          gamesDocumented: 0,
        })}
      />
    );

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows an em dash only when no games are logged at all", () => {
    renderWithProviders(
      <ReliabilityMeter
        reliability={makeProspectReliability({
          score: null,
          gamesLogged: 0,
          gamesVerified: 0,
          gamesDocumented: 0,
          tier: "UNDOCUMENTED",
        })}
      />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("says what the score actually measures", () => {
    renderWithProviders(<ReliabilityMeter reliability={makeProspectReliability()} />);

    expect(screen.getByText(/not whether the figures are true/i)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(
      <ReliabilityMeter reliability={makeProspectReliability()} />
    );

    await expectNoAccessibilityViolations(container);
  });
});
