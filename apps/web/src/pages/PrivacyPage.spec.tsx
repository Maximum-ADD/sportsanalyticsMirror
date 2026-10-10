import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { PrivacyPage } from "./PrivacyPage";

function renderPrivacyPage() {
  return render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>
  );
}

describe("PrivacyPage", () => {
  it("covers what POPIA asks a notice to say", () => {
    renderPrivacyPage();

    for (const heading of [
      "Who we are",
      "What we keep, and why",
      "What other people can see",
      "Where it is stored",
      "How long we keep it",
      "How we protect it",
      "Your rights",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("gives a contact address and the Information Regulator for complaints", () => {
    renderPrivacyPage();

    const contactLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("mailto:"));
    expect(contactLinks.length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Information Regulator/ })).toHaveAttribute("href", "https://inforegulator.org.za/");
  });

  it("points to where a user can download or delete their data", () => {
    renderPrivacyPage();

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByText("Download my data")).toBeInTheDocument();
    expect(screen.getByText("Delete account")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderPrivacyPage();

    await expectNoAccessibilityViolations(container);
  });
});
