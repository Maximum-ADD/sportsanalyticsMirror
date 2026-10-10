import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StatGlossaryInfo } from "./StatGlossaryInfo";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";

function renderGlossary() {
  return renderWithProviders(
    <StatGlossaryInfo label="What USG%, +/-, ORTG and DRTG mean" stats={["USG%", "+/-", "ORTG", "DRTG"]} />
  );
}

describe("StatGlossaryInfo", () => {
  it("opens from the keyboard and explains every stat it was given", async () => {
    // Keyboard and touch both work because it is a disclosure, not a hover
    // tooltip — the reason it reuses InfoTooltip.
    const user = userEvent.setup();
    renderGlossary();

    await user.tab();
    const button = screen.getByRole("button", { name: "What USG%, +/-, ORTG and DRTG mean" });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{Enter}");

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("USG%")).toBeInTheDocument();
    expect(screen.getByText(/share of their team's possessions/i)).toBeInTheDocument();
    expect(screen.getByText(/positive means their team outscored the opponent/i)).toBeInTheDocument();
    expect(screen.getByText(/points scored per 100 possessions/i)).toBeInTheDocument();
    expect(screen.getByText(/points allowed per 100 possessions.*lower is better/i)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderGlossary();
    await user.click(screen.getByRole("button", { name: /what usg%/i }));
    await expectNoAccessibilityViolations(container);
  });
});
