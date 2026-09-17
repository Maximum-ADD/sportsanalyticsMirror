import { screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LandingHeader } from "./LandingHeader";
import { renderWithProviders } from "@/test/renderWithProviders";

// The drawer's focus behaviour is the unit under test; AuthStatus's own
// session logic is irrelevant here and better-auth's client is already
// stubbed globally in test setup, but mocking it out keeps this spec from
// depending on either.
vi.mock("@/components/AuthStatus", () => ({
  AuthStatus: () => <div data-testid="auth-status" />,
}));

// The same links render twice — the in-row nav and the drawer are two
// presentations of one nav (see the component's landmark comment), and
// jsdom applies no CSS so the lg-hidden in-row copy still exists here. The
// button's aria-controls points at the drawer, which scopes every query
// below to the copy under test.
function getDrawer(): HTMLElement {
  const menuButton = screen.getByRole("button", { name: /menu/i });
  return document.getElementById(menuButton.getAttribute("aria-controls")!)!;
}

async function openDrawer(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Open menu" }));
  return getDrawer();
}

describe("LandingHeader mobile drawer", () => {
  it("moves focus to the first drawer link when the menu opens", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingHeader />);

    const drawer = await openDrawer(user);

    expect(within(drawer).getByRole("link", { name: "Home" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
  });

  it("returns focus to the menu button when Escape closes the drawer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingHeader />);

    await openDrawer(user);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("closes on navigation and lands focus back on the menu button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingHeader />);

    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole("link", { name: "Players" }));

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("does not steal focus onto the menu button on initial render", () => {
    renderWithProviders(<LandingHeader />);

    // Nothing has been opened yet — focus belongs to the page, not the header.
    expect(screen.getByRole("button", { name: "Open menu" })).not.toHaveFocus();
  });
});
