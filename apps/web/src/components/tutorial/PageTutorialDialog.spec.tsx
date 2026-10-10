import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HOME_TUTORIAL } from "@/components/tutorial/definitions/homeTutorial";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import type { PageTutorialDefinition } from "@/lib/pageTutorial";
import { PageTutorialDialog } from "./PageTutorialDialog";

// Three steps is the smallest walkthrough with a distinct first, middle and
// last step — enough to cover every button's enabled/disabled/relabelled state.
const TUTORIAL: PageTutorialDefinition = {
  id: "test-page",
  pageName: "test",
  regions: [
    { id: "left-box", label: "Left box", x: 36, y: 18, width: 96, height: 30, sketch: "rows", calloutSide: "left" },
    { id: "right-box", label: "Right box", x: 136, y: 18, width: 48, height: 24, sketch: "rows", calloutSide: "right" },
  ],
  steps: [
    { regionId: null, title: "Welcome", summary: "What this page is for.", points: ["Read on."] },
    { regionId: "left-box", title: "The left box", summary: "What the left box does.", points: ["It lists things."] },
    { regionId: "right-box", title: "The right box", summary: "What the right box does.", points: ["It ranks things."] },
  ],
};

function renderDialog(tutorial: PageTutorialDefinition = TUTORIAL) {
  const onClose = vi.fn();
  const view = render(<PageTutorialDialog tutorial={tutorial} onClose={onClose} />);
  return { ...view, onClose };
}

describe("PageTutorialDialog", () => {
  it("has no automated accessibility violations", async () => {
    const { container } = renderDialog(HOME_TUTORIAL);

    await expectNoAccessibilityViolations(container);
  });

  it("opens as a labelled modal on the first step, with focus on Next", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Page tutorial · test" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(within(dialog).getByText("Step 1 of 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Previous step" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Next step" })).toHaveFocus();
  });

  it("walks forward and back through the steps, highlighting each step's section on the map", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByRole("heading", { name: "The left box" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Map of the test page, with Left box highlighted" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Map of the test page" })).toBeInTheDocument();
  });

  // Previous disables itself on the first step; a disabled button drops
  // focus to the page behind the dialog, so it has to hand focus on first.
  it("moves focus to Next when Previous reaches the first step and disables itself", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Previous step" }));

    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next step" })).toHaveFocus();
  });

  it("turns Next into Complete on the last step, and completing closes it", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Next step" }));

    expect(screen.queryByRole("button", { name: "Next step" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete the tutorial" }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith("complete");
  });

  it.each([
    ["Skip this tutorial", "skip"],
    ["Skip all tutorials", "skip-all"],
    ["Exit the tutorial", "exit"],
  ])("closes with the right reason from %s, on any step", async (buttonName, reason) => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: buttonName }));

    expect(onClose).toHaveBeenCalledExactlyOnceWith(reason);
  });

  it("shows each button's short visible label", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    for (const label of ["Skip all", "Skip", "Exit", "Previous", "Next"]) {
      expect(within(dialog).getByText(label, { exact: true })).toBeInTheDocument();
    }
  });

  it("exits on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledExactlyOnceWith("exit");
  });

  it("steps with the arrow keys, without running past either end", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    // The arrow key never completes the tutorial — only the button does.
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("keeps Tab inside the dialog, in both directions", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Focus starts on Next, the last enabled button in the dialog.
    await user.tab();
    expect(screen.getByRole("button", { name: "Exit the tutorial" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Next step" })).toHaveFocus();
  });

  // A click on the header's own text focuses the panel (tabIndex -1), which
  // sits before every button in the tab order — Shift+Tab from there has to
  // wrap to the last button, not escape to the page behind the dialog.
  it("keeps Shift+Tab inside the dialog after a click on the header's text", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page behind</button>
        <PageTutorialDialog tutorial={TUTORIAL} onClose={vi.fn()} />
      </>
    );

    await user.click(screen.getByText("Step 1 of 3"));
    expect(screen.getByRole("dialog")).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Next step" })).toHaveFocus();
  });

  // The step's content takes focus itself (see the next test), so a click on
  // its text lands there — inside the tab loop, where Shift+Tab reaches Exit.
  it("keeps focus inside the dialog after a click on the step's text", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page behind</button>
        <PageTutorialDialog tutorial={TUTORIAL} onClose={vi.fn()} />
      </>
    );

    await user.click(screen.getByText("What this page is for."));
    expect(screen.getByRole("region", { name: "Welcome" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Exit the tutorial" })).toHaveFocus();
  });

  // Safari doesn't make scroll containers keyboard-focusable, and nothing
  // inside this one can take focus — so it has to, or a keyboard user on a
  // short screen could never scroll down to the step's text.
  it("lets the keyboard reach the step's content, named after the step", async () => {
    const user = userEvent.setup();
    renderDialog();

    const stepContent = screen.getByRole("region", { name: "Welcome" });
    expect(stepContent).toHaveAttribute("tabindex", "0");

    await user.tab();
    await user.tab();
    expect(stepContent).toHaveFocus();
  });

  // The scroller is the same element on every step; left alone, a step would
  // open where the last one was scrolled to, its highlight out of view.
  it("starts every step scrolled to the top, map first", async () => {
    const user = userEvent.setup();
    renderDialog();
    const stepContent = screen.getByRole("region", { name: "Welcome" });

    stepContent.scrollTop = 240;
    await user.click(screen.getByRole("button", { name: "Next step" }));

    expect(stepContent.scrollTop).toBe(0);
  });

  it("tells screen readers where each new step is in the tutorial, along with what it says", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Next step" }));

    const announcement = screen.getByRole("heading", { name: "The left box" }).parentElement as HTMLElement;
    expect(announcement).toHaveAttribute("aria-live", "polite");
    expect(announcement).toHaveTextContent(/^Step 2 of 3\.\s*The left box/);
  });

  // Leaving a one-time tutorial should always be a decision: a stray click on
  // the blurred page would otherwise spend it.
  it("ignores clicks on the blurred page behind it", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    const backdrop = screen.getByRole("dialog").previousElementSibling as HTMLElement;

    await user.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next step" })).toHaveFocus();
  });

  it("hands focus back to whatever opened it once it closes", async () => {
    function Harness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open the tutorial
          </button>
          {isOpen && <PageTutorialDialog tutorial={TUTORIAL} onClose={() => setIsOpen(false)} />}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open the tutorial" }));
    expect(screen.getByRole("button", { name: "Next step" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the tutorial" })).toHaveFocus();
  });
});
