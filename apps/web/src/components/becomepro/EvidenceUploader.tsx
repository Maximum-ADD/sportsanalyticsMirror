import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteProspectEvidence,
  invalidateProspectQueries,
  uploadProspectEvidence,
} from "@/lib/becomeProApi";
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  EVIDENCE_STATUS_LABELS,
  MAX_EVIDENCE_SIZE_MB,
} from "@/lib/prospectValue";
import type { ProspectEvidence } from "@/types/nba";

interface EvidenceUploaderProps {
  seasonId: string;
  username: string;
  evidence: ProspectEvidence[];
}

const BUTTON_CLASS =
  "min-h-11 border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";

/**
 * Scoresheet upload, and the list of what has already been uploaded.
 *
 * Follows ProfilePage's AvatarEditor almost line for line — an sr-only file
 * input behind a real button, a client-side guard before the network, and a
 * local error message — because that is the one file-upload pattern this app
 * already has and the two should not diverge.
 *
 * Defaults to covering the WHOLE season rather than individual games: a
 * league's published stat page is one document that vouches for everything at
 * once, and it is by a distance the highest-leverage single upload somebody
 * can make. Per-game attachment exists on the API for the cases where it does
 * not (a photographed scoresheet from one night).
 */
export function EvidenceUploader({ seasonId, username, evidence }: EvidenceUploaderProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProspectEvidence({ seasonId, file, wholeSeason: true }),
    onSuccess: () => invalidateProspectQueries(queryClient, username),
    onError: () => setErrorMessage("Couldn't upload that file. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (evidenceId: string) => deleteProspectEvidence(evidenceId),
    onSuccess: () => invalidateProspectQueries(queryClient, username),
  });

  function handleFileChosen(file: File | undefined) {
    if (!file) return;
    setErrorMessage(null);

    // Mirrors the API's own limits so an obviously-invalid file never costs a
    // round trip. The API re-validates regardless — this is a courtesy, not a
    // control.
    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(file.type)) {
      setErrorMessage("Only PNG, JPEG, WebP, and PDF files are supported.");
      return;
    }
    if (file.size > MAX_EVIDENCE_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`File must be ${MAX_EVIDENCE_SIZE_MB}MB or smaller.`);
      return;
    }

    uploadMutation.mutate(file);
  }

  return (
    <div>
      <p className="text-[12px] text-locker-ink-muted">
        Upload a scoresheet, a league stat page or an official box score to have this season
        verified. An admin checks each one. Uploads are private — other people see only whether a
        document was verified, never the file.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EVIDENCE_MIME_TYPES.join(",")}
        className="sr-only"
        aria-label="Choose a document to upload"
        onChange={(event) => handleFileChosen(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className={`mt-3 ${BUTTON_CLASS}`}
      >
        {uploadMutation.isPending ? "Uploading…" : "Upload a document"}
      </button>

      {errorMessage && <p className="mt-2 text-[11.5px] text-locker-bad">{errorMessage}</p>}

      {evidence.length === 0 ? (
        <p className="mt-3 border border-dashed border-landing-light bg-landing-hero p-4 text-center text-[12px] text-locker-ink-muted">
          Nothing uploaded yet — this season counts as undocumented.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {evidence.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center gap-2.5 border border-landing-light bg-landing-hero p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-landing-ink">{document.fileName}</p>
                <p className="text-[10.5px] text-locker-ink-muted">
                  {/* The status is a word, never a colour alone. */}
                  {EVIDENCE_STATUS_LABELS[document.status]} · covers {document.gamesCovered}{" "}
                  {document.gamesCovered === 1 ? "game" : "games"}
                </p>
                {/* A rejection without its reason is worse than no rejection. */}
                {document.status === "REJECTED" && document.reviewNote && (
                  <p className="mt-1 text-[10.5px] text-locker-bad">{document.reviewNote}</p>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove ${document.fileName}`}
                onClick={() => deleteMutation.mutate(document.id)}
                disabled={deleteMutation.isPending}
                className="min-h-11 border border-landing-light px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-locker-ink-muted uppercase transition-colors hover:border-locker-bad hover:text-locker-bad disabled:opacity-50 sm:min-h-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
