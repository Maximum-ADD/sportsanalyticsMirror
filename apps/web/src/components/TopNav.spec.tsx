import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TopNav } from "./TopNav";
import { renderWithProviders } from "@/test/renderWithProviders";

describe("TopNav", () => {
  it("renders a banner containing a labelled primary navigation", () => {
    renderWithProviders(<TopNav />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("renders the five landing nav destinations", () => {
    renderWithProviders(<TopNav />);

    for (const label of ["Home", "Players", "Teams", "Register", "Login"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("points every nav link at the dashboard while the real routes do not exist", () => {
    renderWithProviders(<TopNav />);

    // Scoped to the nav so the skip link is not counted.
    const links = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link");

    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/home");
    }
  });

  it("renders the wordmark as static text rather than a self-referential link", () => {
    renderWithProviders(<TopNav />);

    expect(screen.getByText("NBA Analytics")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /NBA Analytics/i })).not.toBeInTheDocument();
  });

  it("puts a skip-to-content link first in the tab order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopNav />);

    await user.tab();

    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("renders the live match card inside the bar", () => {
    renderWithProviders(<TopNav />);

    expect(screen.getByRole("group", { name: "Live match updates" })).toBeInTheDocument();
  });

  // Deliberate: a working Google sign-in beside two placeholder links would give
  // three sign-in-shaped affordances, two of which do nothing.
  it("renders no auth control — sign-in lives in the dashboard sidebar", () => {
    renderWithProviders(<TopNav />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
