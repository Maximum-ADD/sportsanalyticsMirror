import { useState } from "react";
import { Link } from "react-router-dom";
import type { SavedCorrection } from "@/lib/adminApi";
import { BUTTON_CLASS } from "./adminStyles";
import { CorrectionGamePicker } from "./CorrectionGamePicker";
import { CorrectionHistory } from "./CorrectionHistory";
import type { CorrectionSavedNotice } from "./correctionQueries";
import { GamePlayByPlayPanel } from "./GamePlayByPlayPanel";

interface AdminCorrectionsSectionProps {
  // The game being corrected, or null while one is being picked. Owned by
  // AdminPage so the Batches tab can open a game here directly.
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
}

/**
 * The Corrections tab: pick a game, correct its plays (each correction
 * re-derives the game's stats and is recorded with a reason), and review or
 * undo past corrections. Plays can be edited but never added or deleted.
 */
export function AdminCorrectionsSection({ selectedGameId, onSelectGame }: AdminCorrectionsSectionProps) {
  const [notice, setNotice] = useState<CorrectionSavedNotice | null>(null);

  function announce(message: string) {
    return (saved: SavedCorrection) =>
      setNotice({ message, season: saved.season, releasesMarkedStale: saved.releasesMarkedStale });
  }

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-locker-ink-muted">
        Correct a play that was recorded wrong (wrong player, 2 vs 3 points, made vs missed, wrong assist). The game's
        player stats are re-derived from its plays straight away, and every correction is kept below with who made it
        and why.
      </p>

      {notice && <CorrectionSavedBanner notice={notice} onDismiss={() => setNotice(null)} />}

      {selectedGameId ? (
        <GamePlayByPlayPanel
          gameId={selectedGameId}
          onChangeGame={() => onSelectGame(null)}
          onCorrectionSaved={announce("Correction saved.")}
        />
      ) : (
        <CorrectionGamePicker onSelectGame={onSelectGame} />
      )}

      <CorrectionHistory key={selectedGameId ?? "all"} gameId={selectedGameId} onReverted={announce("Correction undone.")} />
    </div>
  );
}

/** "2 published 2025-26 dataset releases are now marked stale." */
function describeStaleReleases(releaseCount: number, season: string): string {
  if (releaseCount === 0) return `No ${season} dataset releases had been published, so none needed marking stale.`;
  const releases = releaseCount === 1 ? "release is" : "releases are";
  return `${releaseCount} published ${season} dataset ${releases} now marked stale.`;
}

/**
 * Confirms a save and says the season's dataset releases are now stale:
 * a published release is an immutable snapshot, so it's flagged rather
 * than rewritten, and an admin publishes a new one from the Datasets page.
 */
function CorrectionSavedBanner({ notice, onDismiss }: { notice: CorrectionSavedNotice; onDismiss: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-yellow-300 bg-yellow-50 px-3 py-2.5">
      <p className="text-[12.5px] text-yellow-900">
        {notice.message} {describeStaleReleases(notice.releasesMarkedStale, notice.season)}{" "}
        <Link to="/datasets" className="underline">
          Publish a new release on the Datasets page
        </Link>
        .
      </p>
      <button type="button" className={BUTTON_CLASS} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
