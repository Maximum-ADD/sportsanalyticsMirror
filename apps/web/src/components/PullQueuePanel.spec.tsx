import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PullQueuePanel } from "./PullQueuePanel";
import { cancelIngestionRequest, fetchIngestionRequests, type IngestionPullRequest } from "@/lib/adminApi";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/adminApi", () => ({
  fetchIngestionRequests: vi.fn(),
  cancelIngestionRequest: vi.fn(),
}));

function makeRequest(overrides: Partial<IngestionPullRequest> = {}): IngestionPullRequest {
  return {
    id: "request-1",
    status: "QUEUED",
    season: "2025-26",
    fromDate: "2026-04-14",
    toDate: "2026-04-18",
    scheduled: false,
    requestedAt: new Date().toISOString(),
    claimedBy: null,
    claimedAt: null,
    finishedAt: null,
    message: null,
    requestedBy: { id: "admin-1", name: "Admin One" },
    ...overrides,
  };
}

describe("PullQueuePanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("says when there is nothing queued", async () => {
    vi.mocked(fetchIngestionRequests).mockResolvedValue([]);

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);

    expect(await screen.findByText("No pulls queued yet.")).toBeInTheDocument();
  });

  it("shows whether a worker is around to run queued pulls", async () => {
    vi.mocked(fetchIngestionRequests).mockResolvedValue([]);

    renderWithProviders(<PullQueuePanel workerLastSeenAt={new Date().toISOString()} />);

    expect(await screen.findByText(/Pull worker online/)).toBeInTheDocument();
  });

  it("lists each request with what it asked for and who asked", async () => {
    vi.mocked(fetchIngestionRequests).mockResolvedValue([makeRequest()]);

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);

    expect(await screen.findByText("2025-26, 2026-04-14 to 2026-04-18")).toBeInTheDocument();
    expect(screen.getByText("QUEUED")).toBeInTheDocument();
    expect(screen.getByText(/Requested by Admin One/)).toBeInTheDocument();
  });

  it("shows where a pull ran and how it ended", async () => {
    vi.mocked(fetchIngestionRequests).mockResolvedValue([
      makeRequest({
        status: "FAILED",
        claimedBy: "home-pc",
        message: "ingest.py exited with code 1.\nstats.nba.com timed out",
      }),
    ]);

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);

    expect(await screen.findByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText(/run on home-pc/)).toBeInTheDocument();
    expect(screen.getByText(/stats.nba.com timed out/)).toBeInTheDocument();
  });

  it("labels a pull the schedule queued", async () => {
    vi.mocked(fetchIngestionRequests).mockResolvedValue([makeRequest({ scheduled: true, requestedBy: null })]);

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);

    expect(await screen.findByText(/^Scheduled/)).toBeInTheDocument();
  });

  it("offers cancel only for a pull no worker has picked up", async () => {
    vi.mocked(fetchIngestionRequests).mockResolvedValue([
      makeRequest({ id: "queued" }),
      makeRequest({ id: "running", status: "RUNNING", claimedBy: "home-pc" }),
      makeRequest({ id: "done", status: "SUCCEEDED" }),
    ]);

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);

    await screen.findByText("RUNNING");
    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(1);
    const queuedRow = screen.getByText("QUEUED").closest("li")!;
    expect(within(queuedRow).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("cancels a queued pull and refreshes the queue", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIngestionRequests).mockResolvedValue([makeRequest({ id: "queued" })]);
    vi.mocked(cancelIngestionRequest).mockResolvedValue({ cancelled: true });

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(cancelIngestionRequest).toHaveBeenCalledWith("queued"));
    await waitFor(() => expect(fetchIngestionRequests).toHaveBeenCalledTimes(2));
  });

  it("reports a failed cancel", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIngestionRequests).mockResolvedValue([makeRequest()]);
    vi.mocked(cancelIngestionRequest).mockRejectedValue(new Error("Only a queued pull can be cancelled"));

    renderWithProviders(<PullQueuePanel workerLastSeenAt={null} />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Only a queued pull can be cancelled")).toBeInTheDocument();
  });
});
