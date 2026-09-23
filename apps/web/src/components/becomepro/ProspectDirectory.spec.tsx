import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { fetchProspectDirectory } from "@/lib/becomeProApi";
import { ProspectDirectory } from "./ProspectDirectory";
import type { ProspectDirectoryEntry } from "@/types/nba";

vi.mock("@/lib/becomeProApi", () => ({
  PROSPECT_DIRECTORY_QUERY_KEY: ["prospectDirectory"],
  fetchProspectDirectory: vi.fn(),
}));

function makeEntry(overrides: Partial<ProspectDirectoryEntry> = {}): ProspectDirectoryEntry {
  return {
    username: "kiran",
    displayName: "Kiran",
    avatarUrl: null,
    competitionLevel: "NCAA_D2",
    gamesLogged: 14,
    pointsPerGame: 24.1,
    rank: 12,
    ...overrides,
  };
}

function paged(data: ProspectDirectoryEntry[], total = data.length) {
  return { data, page: 1, pageSize: 25, total };
}

describe("ProspectDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProspectDirectory).mockResolvedValue(paged([makeEntry()]));
  });

  it("lists each prospect with their level, games and scoring", async () => {
    renderWithProviders(<ProspectDirectory />);

    expect(await screen.findByText("Kiran")).toBeInTheDocument();
    expect(screen.getByText(/D2 · 14 games · 24\.1 PPG/)).toBeInTheDocument();
  });

  it("links through to each prospect's page", async () => {
    renderWithProviders(<ProspectDirectory />);

    expect(await screen.findByRole("link", { name: /Kiran/ })).toHaveAttribute(
      "href",
      "/become-pro/kiran"
    );
  });

  // The whole reason this surface exists: someone below the games floor is
  // never on the value board, but they are still a person you can look up.
  it("lists prospects who are not ranked yet", async () => {
    vi.mocked(fetchProspectDirectory).mockResolvedValue(
      paged([makeEntry({ username: "rookie", displayName: "Rookie", rank: null, gamesLogged: 3 })])
    );

    renderWithProviders(<ProspectDirectory />);

    expect(await screen.findByText("Rookie")).toBeInTheDocument();
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it("passes a search term to the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProspectDirectory />);
    await screen.findByText("Kiran");

    await user.type(screen.getByLabelText(/search prospects by name/i), "sam");

    await waitFor(() => {
      expect(vi.mocked(fetchProspectDirectory).mock.calls.at(-1)?.[0]).toMatchObject({
        search: "sam",
      });
    });
  });

  it("filters by competition level", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProspectDirectory />);
    await screen.findByText("Kiran");

    await user.selectOptions(screen.getByLabelText(/competition level/i), "NCAA_D1");

    await waitFor(() => {
      expect(vi.mocked(fetchProspectDirectory).mock.calls.at(-1)?.[0]).toMatchObject({
        level: "NCAA_D1",
      });
    });
  });

  it("says so when a search matches nobody", async () => {
    vi.mocked(fetchProspectDirectory).mockResolvedValue(paged([]));

    renderWithProviders(<ProspectDirectory />);

    expect(await screen.findByText(/no prospects match that search yet/i)).toBeInTheDocument();
  });

  it("recovers from a failed load", async () => {
    vi.mocked(fetchProspectDirectory).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    renderWithProviders(<ProspectDirectory />);
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Kiran")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<ProspectDirectory />);
    await screen.findByText("Kiran");

    await expectNoAccessibilityViolations(container);
  });
});
