import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectEvidence } from "@/test/becomeProFixtures";
import {
  fetchProspectEvidenceQueue,
  reviewProspectEvidence,
} from "@/lib/becomeProApi";
import { EvidenceReviewQueue } from "./EvidenceReviewQueue";
import type { AdminProspectEvidence } from "@/types/nba";

vi.mock("@/lib/becomeProApi", () => ({
  fetchProspectEvidenceQueue: vi.fn(),
  reviewProspectEvidence: vi.fn(),
}));

function makeQueueRow(overrides: Partial<AdminProspectEvidence> = {}): AdminProspectEvidence {
  return {
    ...makeProspectEvidence(),
    owner: { username: "kiran", displayName: "Kiran" },
    ...overrides,
  };
}

function paged(data: AdminProspectEvidence[]) {
  return { data, page: 1, pageSize: 25, total: data.length };
}

describe("EvidenceReviewQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProspectEvidenceQueue).mockResolvedValue(paged([makeQueueRow()]));
    vi.mocked(reviewProspectEvidence).mockResolvedValue(makeProspectEvidence());
  });

  it("lists each pending document with its owner and coverage", async () => {
    renderWithProviders(<EvidenceReviewQueue />);

    expect(await screen.findByRole("link", { name: "Kiran" })).toHaveAttribute(
      "href",
      "/become-pro/kiran"
    );
    expect(screen.getByText(/scoresheet-jan\.pdf · covers 4 games/)).toBeInTheDocument();
  });

  it("opens the pending queue by default", async () => {
    renderWithProviders(<EvidenceReviewQueue />);
    await screen.findByRole("link", { name: "Kiran" });

    expect(vi.mocked(fetchProspectEvidenceQueue).mock.calls[0]?.[0]).toMatchObject({
      status: "PENDING",
    });
  });

  it("links through to the document itself", async () => {
    renderWithProviders(<EvidenceReviewQueue />);

    expect(await screen.findByRole("link", { name: /open the document/i })).toHaveAttribute(
      "href",
      "https://storage.example/signed/scoresheet-jan.pdf"
    );
  });

  it("says so when the file is gone rather than implying no permission", async () => {
    vi.mocked(fetchProspectEvidenceQueue).mockResolvedValue(
      paged([makeQueueRow({ fileUrl: null })])
    );

    renderWithProviders(<EvidenceReviewQueue />);

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });

  it("verifies a document", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EvidenceReviewQueue />);

    await user.click(await screen.findByRole("button", { name: /verify/i }));

    expect(reviewProspectEvidence).toHaveBeenCalledWith("evidence-1", {
      status: "VERIFIED",
      note: undefined,
    });
  });

  it("carries a rejection reason through to the prospect", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EvidenceReviewQueue />);

    await user.type(await screen.findByLabelText(/reason/i), "The scan is unreadable.");
    await user.click(screen.getByRole("button", { name: /reject/i }));

    expect(reviewProspectEvidence).toHaveBeenCalledWith("evidence-1", {
      status: "REJECTED",
      note: "The scan is unreadable.",
    });
  });

  it("offers no decision buttons on an already-reviewed document", async () => {
    vi.mocked(fetchProspectEvidenceQueue).mockResolvedValue(
      paged([makeQueueRow({ status: "VERIFIED", reviewedAt: "2026-02-02T00:00:00.000Z" })])
    );

    renderWithProviders(<EvidenceReviewQueue />);
    await screen.findByRole("link", { name: "Kiran" });

    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
  });

  // The reviewer needs to know a verification cannot be gamed after the fact.
  it("explains that editing a game clears its verification", async () => {
    renderWithProviders(<EvidenceReviewQueue />);

    expect(await screen.findByText(/clears its verification automatically/i)).toBeInTheDocument();
  });

  it("says so when the queue is empty", async () => {
    vi.mocked(fetchProspectEvidenceQueue).mockResolvedValue(paged([]));

    renderWithProviders(<EvidenceReviewQueue />);

    expect(await screen.findByText(/nothing waiting for review/i)).toBeInTheDocument();
  });

  it("recovers from a failed load", async () => {
    vi.mocked(fetchProspectEvidenceQueue).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    renderWithProviders(<EvidenceReviewQueue />);
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("link", { name: "Kiran" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<EvidenceReviewQueue />);
    await screen.findByRole("link", { name: "Kiran" });

    await expectNoAccessibilityViolations(container);
  });
});
