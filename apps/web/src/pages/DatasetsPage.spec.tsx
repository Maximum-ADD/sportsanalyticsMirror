import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatasetsPage } from "./DatasetsPage";
import { fetchJson } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/apiClient", () => ({
  fetchJson: vi.fn(),
}));

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    version: "2025-26.1",
    description: "Initial release",
    season: "2025-26",
    checksum: "abc123",
    gamesCount: 100,
    playersCount: 50,
    eventsCount: 0,
    fieldSchema: [
      { column: "playerId", type: "string", description: "Internal UUID" },
    ],
    publishedAt: "2026-09-01T12:00:00.000Z",
    publishedBy: { id: "u1", name: "Admin" },
    ...overrides,
  };
}

describe("DatasetsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    vi.mocked(fetchJson).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<DatasetsPage />);
    expect(screen.getByText("Loading releases")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error("fail"));
    renderWithProviders(<DatasetsPage />);
    expect(await screen.findByText("Could not load dataset releases.")).toBeInTheDocument();
  });

  it("shows empty state when there are no releases", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0 });
    renderWithProviders(<DatasetsPage />);
    expect(await screen.findByText("No dataset releases published yet.")).toBeInTheDocument();
  });

  it("lists releases and expands one to show checksum and schema", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchJson).mockResolvedValue({
      data: [makeRelease()],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    renderWithProviders(<DatasetsPage />);

    expect(await screen.findByText("2025-26.1")).toBeInTheDocument();
    expect(screen.getByText("Initial release")).toBeInTheDocument();

    // Expand the release
    await user.click(screen.getByText("2025-26.1"));
    expect(await screen.findByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("playerId")).toBeInTheDocument();
    expect(screen.getByText("Published by Admin")).toBeInTheDocument();

    // Collapse it
    await user.click(screen.getByText("2025-26.1"));
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
  });

  it("hides publishedBy when null", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      data: [makeRelease({ publishedBy: null })],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    renderWithProviders(<DatasetsPage />);
    await screen.findByText("2025-26.1");
    expect(screen.queryByText(/Published by/)).not.toBeInTheDocument();
  });
});
