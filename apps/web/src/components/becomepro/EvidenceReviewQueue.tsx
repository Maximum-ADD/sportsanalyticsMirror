import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Pagination } from "@/components/Pagination";
import {
  fetchProspectEvidenceQueue,
  reviewProspectEvidence,
} from "@/lib/becomeProApi";
import { EVIDENCE_STATUS_LABELS } from "@/lib/prospectValue";
import type { AdminProspectEvidence, EvidenceStatus } from "@/types/nba";

const REVIEW_QUEUE_QUERY_KEY = ["adminProspectEvidence"];

/**
 * The reviewer half of Become Pro's verification.
 *
 * This exists because without it the whole evidence feature is inert: nothing
 * would ever leave PENDING, every prospect would sit at a reliability of zero
 * forever, and the value figure would be permanently pinned to its most
 * demoted presentation. An upload queue nobody can empty is worse than no
 * upload at all, because it implies a check that never happens.
 *
 * The document itself is only ever reached through the signed URL the API
 * returns to an admin — scorecards carry other people's names, so they are
 * never part of the public payload.
 */
export function EvidenceReviewQueue() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EvidenceStatus>("PENDING");
  const [noteByEvidenceId, setNoteByEvidenceId] = useState<Record<string, string>>({});

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...REVIEW_QUEUE_QUERY_KEY, { page, status }],
    queryFn: () => fetchProspectEvidenceQueue({ status, page }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      evidenceId,
      decision,
      note,
    }: {
      evidenceId: string;
      decision: Extract<EvidenceStatus, "VERIFIED" | "REJECTED">;
      note?: string;
    }) => reviewProspectEvidence(evidenceId, { status: decision, note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_QUERY_KEY }),
  });

  return (
    <section className="border border-landing-light bg-locker-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
          Become Pro evidence
        </h2>
        <label htmlFor="evidence-status" className="sr-only">
          Filter by review status
        </label>
        <select
          id="evidence-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EvidenceStatus);
            setPage(1);
          }}
          className="border border-landing-light bg-landing-hero px-3 py-1.5 text-[12px] text-landing-ink focus:border-locker-leather focus:outline-none"
        >
          {(["PENDING", "VERIFIED", "REJECTED"] as EvidenceStatus[]).map((option) => (
            <option key={option} value={option}>
              {EVIDENCE_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-[11.5px] text-locker-ink-muted">
        Verifying a document raises the reliability score of every game it covers. Editing a game
        clears its verification automatically, so an approved figure cannot be changed afterwards.
      </p>

      {isPending && (
        <div role="status" aria-label="Loading the review queue" className="animate-pulse space-y-1.5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-12 bg-landing-hero" />
          ))}
        </div>
      )}

      {isError && (
        <>
          <p className="text-[12px] text-locker-bad">Could not load the review queue.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-[12px] text-locker-leather underline underline-offset-[3px]"
          >
            Try again
          </button>
        </>
      )}

      {data && data.data.length === 0 && (
        <p className="border border-dashed border-landing-light bg-landing-hero p-5 text-center text-[12.5px] text-locker-ink-muted">
          Nothing waiting for review.
        </p>
      )}

      {data && data.data.length > 0 && (
        <>
          <ul className="space-y-2.5">
            {data.data.map((document) => (
              <EvidenceRow
                key={document.id}
                document={document}
                note={noteByEvidenceId[document.id] ?? ""}
                onNoteChange={(note) =>
                  setNoteByEvidenceId((previous) => ({ ...previous, [document.id]: note }))
                }
                onDecide={(decision) =>
                  reviewMutation.mutate({
                    evidenceId: document.id,
                    decision,
                    note: noteByEvidenceId[document.id] || undefined,
                  })
                }
                isDeciding={reviewMutation.isPending}
              />
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
            tone="locker"
          />
        </>
      )}
    </section>
  );
}

function EvidenceRow({
  document,
  note,
  onNoteChange,
  onDecide,
  isDeciding,
}: {
  document: AdminProspectEvidence;
  note: string;
  onNoteChange: (note: string) => void;
  onDecide: (decision: "VERIFIED" | "REJECTED") => void;
  isDeciding: boolean;
}) {
  const noteId = `evidence-note-${document.id}`;

  return (
    <li className="border border-landing-light bg-landing-hero p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/become-pro/${document.owner.username}`}
            className="font-display text-[13px] text-landing-ink uppercase underline-offset-[3px] hover:underline"
          >
            {document.owner.displayName}
          </Link>
          <p className="mt-0.5 truncate text-[11.5px] text-locker-ink-muted">
            {document.fileName} · covers {document.gamesCovered}{" "}
            {document.gamesCovered === 1 ? "game" : "games"}
          </p>
        </div>
        <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
          {EVIDENCE_STATUS_LABELS[document.status]}
        </span>
      </div>

      {/* Only an admin's payload carries a URL at all; a missing one means the
          file is gone rather than that this reviewer cannot see it. */}
      {document.fileUrl ? (
        <a
          href={document.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11.5px] text-locker-leather underline underline-offset-[3px]"
        >
          Open the document
        </a>
      ) : (
        <p className="mt-2 text-[11.5px] text-locker-ink-muted">The file is no longer available.</p>
      )}

      {document.status === "PENDING" && (
        <div className="mt-2.5">
          <label htmlFor={noteId} className="sr-only">
            Reason, shown to the prospect if you reject this
          </label>
          <input
            id={noteId}
            type="text"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Reason (shown to them if rejected)"
            className="w-full max-w-md border border-landing-light bg-locker-surface px-3 py-1.5 text-[12px] text-landing-ink focus:border-locker-leather focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDecide("VERIFIED")}
              disabled={isDeciding}
              className="min-h-11 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-locker-good uppercase transition-colors hover:border-locker-good disabled:opacity-50 sm:min-h-0"
            >
              Verify
            </button>
            <button
              type="button"
              onClick={() => onDecide("REJECTED")}
              disabled={isDeciding}
              className="min-h-11 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-locker-bad uppercase transition-colors hover:border-locker-bad disabled:opacity-50 sm:min-h-0"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {document.status === "REJECTED" && document.reviewNote && (
        <p className="mt-2 text-[11.5px] text-locker-bad">{document.reviewNote}</p>
      )}
    </li>
  );
}
