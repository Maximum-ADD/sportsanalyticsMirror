import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectNoAccessibilityViolations } from "@/test/accessibility";
import { makeProspectEvidence } from "@/test/becomeProFixtures";
import {
  deleteProspectEvidence,
  uploadProspectEvidence,
} from "@/lib/becomeProApi";
import { MAX_EVIDENCE_SIZE_MB } from "@/lib/prospectValue";
import { EvidenceUploader } from "./EvidenceUploader";

vi.mock("@/lib/becomeProApi", () => ({
  uploadProspectEvidence: vi.fn(),
  deleteProspectEvidence: vi.fn(),
  invalidateProspectQueries: vi.fn().mockResolvedValue(undefined),
}));

function renderUploader(evidence = [makeProspectEvidence()]) {
  return renderWithProviders(
    <EvidenceUploader seasonId="season-1" username="kiran" evidence={evidence} />
  );
}

function makeFile(name: string, type: string, sizeInBytes = 1024) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeInBytes });
  return file;
}

describe("EvidenceUploader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadProspectEvidence).mockResolvedValue(makeProspectEvidence());
    vi.mocked(deleteProspectEvidence).mockResolvedValue({ deleted: true });
  });

  it("uploads an accepted document against the whole season", async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(
      screen.getByLabelText(/choose a document/i),
      makeFile("sheet.pdf", "application/pdf")
    );

    expect(uploadProspectEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: "season-1", wholeSeason: true })
    );
  });

  // First line of defence: the picker only offers the types we accept.
  it("limits the file picker to the supported types", () => {
    renderUploader();

    expect(screen.getByLabelText(/choose a document/i)).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/webp,application/pdf"
    );
  });

  // Second line: a file can still arrive past the picker (a drag-drop, a
  // browser that ignores `accept`), so the guard is checked directly rather
  // than through userEvent.upload — which filters on `accept` itself and so
  // could never exercise this branch. Mirrors the API's own check, which
  // re-validates regardless.
  it("rejects an unsupported file type without calling the API", () => {
    renderUploader();
    const input = screen.getByLabelText(/choose a document/i);

    fireEvent.change(input, { target: { files: [makeFile("notes.txt", "text/plain")] } });

    expect(uploadProspectEvidence).not.toHaveBeenCalled();
    expect(screen.getByText(/only png, jpeg, webp, and pdf/i)).toBeInTheDocument();
  });

  it("rejects an oversized file without calling the API", async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.upload(
      screen.getByLabelText(/choose a document/i),
      makeFile("huge.pdf", "application/pdf", (MAX_EVIDENCE_SIZE_MB + 1) * 1024 * 1024)
    );

    expect(uploadProspectEvidence).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(`${MAX_EVIDENCE_SIZE_MB}MB or smaller`, "i"))).toBeInTheDocument();
  });

  // The status is a word so it survives greyscale and a screen reader.
  it("names each document's review status in words", () => {
    renderUploader();

    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });

  it("shows a rejection's reason verbatim", () => {
    renderUploader([
      makeProspectEvidence({
        status: "REJECTED",
        reviewNote: "The scan is unreadable.",
        reviewedAt: "2026-02-02T10:00:00.000Z",
      }),
    ]);

    expect(screen.getByText("The scan is unreadable.")).toBeInTheDocument();
  });

  it("says a season with no uploads counts as undocumented", () => {
    renderUploader([]);

    expect(screen.getByText(/counts as undocumented/i)).toBeInTheDocument();
  });

  // A scoresheet carries other people's names, so the privacy rule has to be
  // stated where the upload happens.
  it("says uploads are private", () => {
    renderUploader();

    expect(screen.getByText(/other people see only whether a document was verified/i)).toBeInTheDocument();
  });

  it("removes an uploaded document", async () => {
    const user = userEvent.setup();
    renderUploader();

    await user.click(screen.getByRole("button", { name: /remove scoresheet-jan\.pdf/i }));

    expect(deleteProspectEvidence).toHaveBeenCalledWith("evidence-1");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderUploader();

    await expectNoAccessibilityViolations(container);
  });
});
