import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import {
  makeProspectReliability,
  makeProspectValuation,
} from "@/test/becomeProFixtures";
import { ProspectValueCard } from "./ProspectValueCard";
import type { ProspectReliability, ProspectValuation } from "@/types/nba";

function renderCard(
  overrides: {
    valuation?: Partial<ProspectValuation>;
    reliability?: Partial<ProspectReliability>;
    rank?: number | null;
    rankState?: Parameters<typeof ProspectValueCard>[0]["rankState"];
    gamesLogged?: number;
    displayName?: string;
  } = {}
) {
  return renderWithProviders(
    <ProspectValueCard
      valuation={makeProspectValuation(overrides.valuation)}
      reliability={makeProspectReliability(overrides.reliability)}
      rank={overrides.rank === undefined ? 12 : overrides.rank}
      rankState={overrides.rankState ?? "RANKED"}
      competitionLevel="NCAA_D2"
      gamesLogged={overrides.gamesLogged ?? 14}
      displayName={overrides.displayName}
    />
  );
}

describe("ProspectValueCard", () => {
  it("leads with the projected draft slot, which is what the model predicts", () => {
    renderCard();

    expect(screen.getByText("Slot 18")).toBeInTheDocument();
    expect(screen.getByText("$4.37M")).toBeInTheDocument();
  });

  it("always shows the interval around the point estimate", () => {
    renderCard();

    expect(screen.getByText(/\$3\.10M – \$5\.90M/)).toBeInTheDocument();
  });

  // Deliberately appears more than once: the micro-label above the figure and
  // the provenance sentence below it both say so, because "self-reported"
  // has to travel with the figure rather than be stated once at the top.
  it("labels the figure as self-reported wherever the figure appears", () => {
    renderCard({ reliability: { tier: "STRONG" } });

    expect(screen.getAllByText(/self-reported/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/projection · self-reported/i)).toBeInTheDocument();
  });

  it("prints the rookie scale year so the figure cannot go silently stale", () => {
    renderCard();

    expect(screen.getByText(/2025-26 NBA rookie scale/)).toBeInTheDocument();
  });

  it("states the level factor as an assumption, with its basis", () => {
    renderCard();

    expect(screen.getByText(/0\.62 level factor/)).toBeInTheDocument();
    expect(screen.getByText(/NCAA Division II scoring translated/i)).toBeInTheDocument();
  });

  it("says plainly that this is not an offer or a market price", () => {
    renderCard();

    expect(screen.getByText(/not an offer and not a market price/i)).toBeInTheDocument();
  });

  // The client must never compose an explanation of a server-side model, so
  // the drivers have to arrive as data and render verbatim.
  it("renders the server-authored drivers verbatim", () => {
    renderCard({
      valuation: {
        drivers: [{ label: "Rebounding", detail: "Top of the level on the defensive glass." }],
      },
    });

    expect(screen.getByText("Rebounding")).toBeInTheDocument();
    expect(screen.getByText(/Top of the level on the defensive glass/)).toBeInTheDocument();
  });

  describe("below the games floor", () => {
    const belowFloor = {
      valuation: {
        projectedDraftSlot: null,
        projectedValueUsd: null,
        projectedValueLowUsd: null,
        projectedValueHighUsd: null,
      },
      rank: null,
      rankState: "BELOW_GAMES_FLOOR" as const,
      gamesLogged: 7,
    };

    // The house rule: a module with nothing real to show says so rather than
    // printing a plausible number.
    it("shows no dollar figure at all", () => {
      renderCard(belowFloor);

      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });

    it("counts the exact shortfall instead", () => {
      renderCard(belowFloor);

      expect(screen.getByText(/3 more games needed/i)).toBeInTheDocument();
    });

    it("shows no rank badge", () => {
      renderCard({ ...belowFloor, displayName: "Kiran" });

      expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    });
  });

  describe("reliability ladder", () => {
    it("promotes the range to the headline when nothing is verified", () => {
      renderCard({ reliability: { tier: "UNDOCUMENTED", score: 0, gamesVerified: 0 } });

      expect(screen.getByText(/unverified estimate/i)).toBeInTheDocument();
      // The point estimate is still present, just demoted — the figure is not
      // hidden, only weighted differently.
      expect(screen.getByText("$4.37M")).toBeInTheDocument();
    });

    it("calls a partly-verified season provisional", () => {
      renderCard({ reliability: { tier: "PARTIAL" } });

      expect(screen.getByText(/provisional/i)).toBeInTheDocument();
    });
  });


  it("marks a what-if figure as hypothetical", () => {
    renderCard({ valuation: { basis: "HYPOTHETICAL" } });

    expect(screen.getByText(/hypothetical/i)).toBeInTheDocument();
  });

  it("shows the rank beside the name when one is given", () => {
    renderCard({ displayName: "Kiran" });

    expect(screen.getByLabelText("Rank 12 on the Become Pro board")).toBeInTheDocument();
    expect(screen.getByText("Kiran")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderCard({ displayName: "Kiran" });

    await expectNoAccessibilityViolations(container);
  });
});
