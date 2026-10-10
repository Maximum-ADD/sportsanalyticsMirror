import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTooltip } from "./InfoTooltip";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";

function renderTooltip() {
  return renderWithProviders(
    <InfoTooltip label="About playing style">
      <p>Players are grouped by how they play, not by how well.</p>
    </InfoTooltip>
  );
}

describe("InfoTooltip", () => {
  it("starts closed", () => {
    renderTooltip();
    expect(screen.queryByText(/not by how well/i)).not.toBeInTheDocument();
  });

  it("opens on click and closes again", async () => {
    const user = userEvent.setup();
    renderTooltip();
    const button = screen.getByRole("button", { name: "About playing style" });

    await user.click(button);
    expect(screen.getByText(/not by how well/i)).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByText(/not by how well/i)).not.toBeInTheDocument();
  });

  it("opens from the keyboard", async () => {
    // A hover-only tooltip is unreachable by keyboard, which is why this is
    // a disclosure rather than a hover target.
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();
    expect(screen.getByRole("button", { name: "About playing style" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.getByText(/not by how well/i)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.click(screen.getByRole("button", { name: "About playing style" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByText(/not by how well/i)).not.toBeInTheDocument();
  });

  it("closes when clicking outside it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <InfoTooltip label="About playing style">
          <p>Players are grouped by how they play, not by how well.</p>
        </InfoTooltip>
        <button type="button">Somewhere else</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "About playing style" }));
    await user.click(screen.getByRole("button", { name: "Somewhere else" }));

    expect(screen.queryByText(/not by how well/i)).not.toBeInTheDocument();
  });

  it("tells assistive technology whether it is open", async () => {
    const user = userEvent.setup();
    renderTooltip();
    const button = screen.getByRole("button", { name: "About playing style" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    // The control has to point at the panel it opens, or a screen reader
    // has no way to reach the explanation it just announced.
    expect(button.getAttribute("aria-controls")).toBe(
      screen.getByText(/not by how well/i).closest("div")?.id
    );
  });

  it("has no accessibility violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderTooltip();
    await user.click(screen.getByRole("button", { name: "About playing style" }));
    await expectNoAccessibilityViolations(container);
  });
});
