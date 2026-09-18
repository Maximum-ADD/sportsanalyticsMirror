import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatasetsPage } from "./DatasetsPage";
import { downloadDatasetRelease, fetchDatasetReleases, publishDatasetRelease } from "@/lib/datasetsApi";
import { useMe } from "@/lib/useMe";
import { ApiError } from "@/lib/apiClient";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/datasetsApi", () => ({
  fetchDatasetReleases: vi.fn(),
  downloadDatasetRelease: vi.fn(),
  publishDatasetRelease: vi.fn(),
}));

vi.mock("@/lib/useMe", () => ({
  useMe: vi.fn(),
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
    isStale: false,
    fieldSchema: [{ column: "playerId", type: "string", description: "Internal UUID" }],
    publishedAt: "2026-09-01T12:00:00.000Z",
    publishedBy: { id: "u1", name: "Admin" },
    ...overrides,
  };
}

function mockReleases(releases: Record<string, unknown>[]) {
  vi.mocked(fetchDatasetReleases).mockResolvedValue({
    data: releases,
    page: 1,
    pageSize: 10,
    total: releases.length,
  } as never);
}

function signInAs(role: "USER" | "ADMIN" | null) {
  vi.mocked(useMe).mockReturnValue({ data: role ? { id: "u1", role } : null } as never);
}

describe("DatasetsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    signInAs(null);
    vi.mocked(fetchDatasetReleases).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<DatasetsPage />);
    expect(screen.getByRole("status", { name: "Loading releases" })).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    signInAs(null);
    vi.mocked(fetchDatasetReleases).mockRejectedValue(new Error("fail"));
    renderWithProviders(<DatasetsPage />);
    expect(await screen.findByText("Could not load dataset releases.")).toBeInTheDocument();
  });

  it("shows empty state when there are no releases", async () => {
    signInAs(null);
    mockReleases([]);
    renderWithProviders(<DatasetsPage />);
    expect(await screen.findByText("No dataset releases published yet.")).toBeInTheDocument();
  });

  it("lists releases and expands one to show checksum and schema", async () => {
    const user = userEvent.setup();
    signInAs(null);
    mockReleases([makeRelease()]);

    renderWithProviders(<DatasetsPage />);

    expect(await screen.findByText("2025-26.1")).toBeInTheDocument();
    expect(screen.getByText("Initial release")).toBeInTheDocument();

    await user.click(screen.getByText("2025-26.1"));
    expect(await screen.findByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("playerId")).toBeInTheDocument();
    expect(screen.getByText("Published by Admin")).toBeInTheDocument();

    await user.click(screen.getByText("2025-26.1"));
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
  });

  it("hides publishedBy when null", async () => {
    signInAs(null);
    mockReleases([makeRelease({ publishedBy: null })]);

    renderWithProviders(<DatasetsPage />);
    await screen.findByText("2025-26.1");
    expect(screen.queryByText(/Published by/)).not.toBeInTheDocument();
  });

  describe("ordering", () => {
    it("requests newest published first by default", async () => {
      signInAs(null);
      mockReleases([makeRelease()]);

      renderWithProviders(<DatasetsPage />);

      await waitFor(() =>
        expect(fetchDatasetReleases).toHaveBeenCalledWith({
          page: 1,
          pageSize: 10,
          sort: "date",
          order: "desc",
        }),
      );
    });

    it("re-requests by season when the sort field changes", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease()]);

      renderWithProviders(<DatasetsPage />);
      await screen.findByText("2025-26.1");

      await user.selectOptions(screen.getByLabelText("Sort by"), "season");

      await waitFor(() =>
        expect(fetchDatasetReleases).toHaveBeenCalledWith({
          page: 1,
          pageSize: 10,
          sort: "season",
          order: "desc",
        }),
      );
    });

    it("re-requests ascending when the direction changes", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease()]);

      renderWithProviders(<DatasetsPage />);
      await screen.findByText("2025-26.1");

      await user.selectOptions(screen.getByLabelText("Sort direction"), "asc");

      await waitFor(() =>
        expect(fetchDatasetReleases).toHaveBeenCalledWith({
          page: 1,
          pageSize: 10,
          sort: "date",
          order: "asc",
        }),
      );
    });
  });

  describe("downloading", () => {
    it("downloads the release through the API rather than a bare link", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease()]);
      vi.mocked(downloadDatasetRelease).mockResolvedValue({ checksum: "abc123" });

      renderWithProviders(<DatasetsPage />);
      await user.click(await screen.findByRole("button", { name: "Download" }));

      await waitFor(() => expect(downloadDatasetRelease).toHaveBeenCalledWith("2025-26.1"));
    });

    it("surfaces the API's message when a download fails", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease()]);
      vi.mocked(downloadDatasetRelease).mockRejectedValue(
        new ApiError("Release is stale after a correction", 409),
      );

      renderWithProviders(<DatasetsPage />);
      await user.click(await screen.findByRole("button", { name: "Download" }));

      expect(await screen.findByText("Release is stale after a correction")).toBeInTheDocument();
    });

    it("confirms a download that matches the published checksum", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease({ checksum: "abc123" })]);
      // Case differs on purpose: hex digests are case-insensitive.
      vi.mocked(downloadDatasetRelease).mockResolvedValue({ checksum: "ABC123" });

      renderWithProviders(<DatasetsPage />);
      await user.click(await screen.findByRole("button", { name: "Download" }));

      expect(await screen.findByText("✓ Matches published checksum")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("warns when the data has changed since the release was published", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease({ checksum: "abc123" })]);
      vi.mocked(downloadDatasetRelease).mockResolvedValue({ checksum: "def456" });

      renderWithProviders(<DatasetsPage />);
      await user.click(await screen.findByRole("button", { name: "Download" }));

      const warning = await screen.findByRole("alert");
      expect(warning).toHaveTextContent(/doesn't match the published checksum/i);
      expect(warning).toHaveTextContent(/since 2025-26\.1 was released/);
    });

    it("claims neither a match nor a mismatch when no checksum came back", async () => {
      const user = userEvent.setup();
      signInAs(null);
      mockReleases([makeRelease()]);
      vi.mocked(downloadDatasetRelease).mockResolvedValue({ checksum: null });

      renderWithProviders(<DatasetsPage />);
      await user.click(await screen.findByRole("button", { name: "Download" }));

      expect(await screen.findByText("Checksum could not be verified")).toBeInTheDocument();
      expect(screen.queryByText("✓ Matches published checksum")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("flags a stale release so its failed download is explicable up front", async () => {
      signInAs(null);
      mockReleases([makeRelease({ isStale: true })]);

      renderWithProviders(<DatasetsPage />);

      expect(await screen.findByText("Stale")).toBeInTheDocument();
      expect(screen.getByText(/no longer matches the source data/)).toBeInTheDocument();
    });
  });

  describe("publishing", () => {
    it("hides the publish form from non-admins", async () => {
      signInAs("USER");
      mockReleases([makeRelease()]);

      renderWithProviders(<DatasetsPage />);
      await screen.findByText("2025-26.1");

      expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    });

    it("lets an admin publish a replacement release", async () => {
      const user = userEvent.setup();
      signInAs("ADMIN");
      mockReleases([makeRelease()]);
      vi.mocked(publishDatasetRelease).mockResolvedValue(
        makeRelease({ version: "2025-26.2" }) as never,
      );

      renderWithProviders(<DatasetsPage />);
      await screen.findByText("2025-26.1");

      await user.type(screen.getByLabelText("Release version"), "2025-26.2");
      await user.type(screen.getByLabelText("Release season"), "2025-26");
      await user.type(screen.getByLabelText("Release description"), "Post-correction rerelease");
      await user.click(screen.getByRole("button", { name: "Publish" }));

      await waitFor(() =>
        expect(publishDatasetRelease).toHaveBeenCalledWith({
          version: "2025-26.2",
          season: "2025-26",
          description: "Post-correction rerelease",
        }),
      );
      expect(await screen.findByText("Published 2025-26.2.")).toBeInTheDocument();
    });

    it("keeps publish disabled until every field is filled in", async () => {
      const user = userEvent.setup();
      signInAs("ADMIN");
      mockReleases([makeRelease()]);

      renderWithProviders(<DatasetsPage />);
      await screen.findByText("2025-26.1");

      expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
      await user.type(screen.getByLabelText("Release version"), "2025-26.2");
      expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    });
  });
});
