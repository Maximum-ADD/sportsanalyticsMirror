import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectValuation } from "@/test/becomeProFixtures";
import { ProspectValueCard } from "./ProspectValueCard";
import type { ProspectValuation, ProspectValuePoint, ValuationState } from "@/types/nba";

const HISTORY: ProspectValuePoint[] = [
  { computedAt: "2026-01-20T12:00:00.000Z", valueUsd: 3_190_000 },
  { computedAt: "2026-02-01T12:00:00.000Z", valueUsd: 3_520_000 },
];

function renderCard(
  overrides: {
    valuation?: ProspectValuation | null;
    valuationState?: ValuationState | null;
    gamesLogged?: number;
    valueHistory?: ProspectValuePoint[];
  } = {}
) {
  return renderWithProviders(
    <ProspectValueCard
      valuation={overrides.valuation === undefined ? makeProspectValuation() : overrides.valuation}
      valuationState={overrides.valuationState === undefined ? "VALUED" : overrides.valuationState}
      competitionLevel="NCAA_D2"
      gamesLogged={overrides.gamesLogged ?? 14}
      minimumGamesRequired={10}
      valueHistory={overrides.valueHistory ?? HISTORY}
    />
  );
}

describe("ProspectValueCard", () => {
  it("leads with the projected draft pick, which is what the model predicts", () => {
    renderCard();

    expect(screen.getByText("Pick 18")).toBeInTheDocument();
    expect(screen.getByText("$3.52M")).toBeInTheDocument();
  });

  it("always shows the interval around the point estimate", () => {
    renderCard();

    expect(screen.getByText(/Range \$2\.53M – \$4\.50M/)).toBeInTheDocument();
  });

  // "Self-reported" travels with the figure rather than being said once
  // somewhere else on the page.
  it("labels the figure as self-reported", () => {
    renderCard();

    expect(screen.getByText(/projection · self-reported/i)).toBeInTheDocument();
    expect(screen.getByText(/14 self-reported games/)).toBeInTheDocument();
  });

  it("prints the rookie scale year so the figure cannot go silently stale", () => {
    renderCard();

    expect(screen.getByText(/2025-26 NBA rookie scale/)).toBeInTheDocument();
  });

  it("states the level factor as an assumption, with its basis", () => {
    renderCard();

    expect(screen.getByText(/0\.62 level factor/)).toBeInTheDocument();
    expect(screen.getByText(/Division II production is translated/)).toBeInTheDocument();
  });

  it("says plainly that this is not an offer or a market price", () => {
    renderCard();

    expect(screen.getByText(/not an offer and not a market price/i)).toBeInTheDocument();
  });

  // The client must never compose an explanation of a server-side model.
  it("renders the server-authored drivers verbatim", () => {
    renderCard({
      valuation: makeProspectValuation({
        drivers: [{ label: "Playmaking", detail: "6.4 assists per game is a real part of this profile." }],
      }),
    });

    expect(screen.getByText("Playmaking")).toBeInTheDocument();
    expect(screen.getByText(/6\.4 assists per game is a real part/)).toBeInTheDocument();
  });

  it("plots the value over time", () => {
    renderCard();

    expect(screen.getByLabelText(/projected value across your last 2 valuations/i)).toBeInTheDocument();
  });

  // One valuation is a dot, not a trend.
  it("draws no trend from a single valuation", () => {
    renderCard({ valueHistory: [HISTORY[0]] });

    expect(screen.queryByLabelText(/projected value across/i)).not.toBeInTheDocument();
  });

  describe("without a valuation", () => {
    // A module with nothing real to show says so rather than printing a
    // plausible number.
    it("shows no dollar figure below the games floor, only the shortfall", () => {
      renderCard({ valuation: null, valuationState: "BELOW_GAMES_FLOOR", gamesLogged: 7 });

      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
      expect(screen.getByText(/3 more games needed/i)).toBeInTheDocument();
    });

    it("says the model has not been trained when that is the reason", () => {
      renderCard({ valuation: null, valuationState: "AWAITING_MODEL", gamesLogged: 30 });

      expect(screen.getByText(/has not been trained yet/i)).toBeInTheDocument();
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderCard();

    await expectNoAccessibilityViolations(container);
  });
});
