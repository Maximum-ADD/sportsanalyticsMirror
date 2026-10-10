import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BUTTON_CLASS, INPUT_CLASS, LABEL_CLASS, QUIET_BUTTON_CLASS } from "@/components/becomepro/styles";
import { ApiError } from "@/lib/apiClient";
import { createProspectSeason, invalidateBecomeProQueries, updateProspectSeason } from "@/lib/becomeProApi";
import {
  COMPETITION_LEVELS_IN_ORDER,
  COMPETITION_LEVEL_LABELS,
  PROSPECT_POSITIONS,
  recentLeagueYears,
} from "@/lib/prospectValue";
import type { CompetitionLevel, CreateProspectSeasonBody, ProspectSeason } from "@/types/nba";

interface SeasonSetupFormProps {
  /** An existing season to edit; omitted to start a new one. */
  season?: ProspectSeason;
  /** League years the user already has, which a NEW season cannot reuse. */
  takenSeasons?: string[];
  /** Called with the saved season's id once the server accepts it. */
  onDone: (seasonId: string) => void;
  onCancel?: () => void;
}

/**
 * Starts a season, or edits the details of one.
 *
 * The competition level is required and explained right where it is chosen,
 * because it is the single biggest thing the valuation turns on: 30 points a
 * game in a recreational league and 30 in Division I are not the same claim.
 */
export function SeasonSetupForm({ season, takenSeasons = [], onDone, onCancel }: SeasonSetupFormProps) {
  const queryClient = useQueryClient();
  const isEditing = season !== undefined;

  // A new season can only pick a league year the user has not already used —
  // the API would refuse a duplicate anyway, and a list that cannot produce
  // one is better than an error after the fact.
  const yearOptions = recentLeagueYears(new Date()).filter(
    (year) => year === season?.season || !takenSeasons.includes(year)
  );

  const [form, setForm] = useState<CreateProspectSeasonBody>({
    season: season?.season ?? yearOptions[0] ?? "",
    competitionLevel: season?.competitionLevel ?? "NCAA_D1",
    position: season?.position ?? "G",
    teamName: season?.teamName ?? "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: CreateProspectSeasonBody) => {
      const payload = { ...body, teamName: body.teamName?.trim() ? body.teamName.trim() : null };
      return isEditing ? updateProspectSeason(season.id, payload) : createProspectSeason(payload);
    },
    onSuccess: async (saved) => {
      setErrorMessage(null);
      await invalidateBecomeProQueries(queryClient);
      onDone(saved.id);
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof ApiError ? error.message : "Couldn't save that season. Please try again.");
    },
  });

  function set<K extends keyof CreateProspectSeasonBody>(field: K, value: CreateProspectSeasonBody[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  const noYearLeft = yearOptions.length === 0;

  return (
    <form
      aria-label={isEditing ? "Edit season details" : "Start a season"}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(form);
      }}
      className="border border-landing-light bg-locker-surface p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASS}>Season</span>
          <select
            className={`mt-1 w-full ${INPUT_CLASS}`}
            value={form.season}
            onChange={(event) => set("season", event.target.value)}
            disabled={noYearLeft}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Position</span>
          <select
            className={`mt-1 w-full ${INPUT_CLASS}`}
            value={form.position}
            onChange={(event) => set("position", event.target.value)}
          >
            {PROSPECT_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className={LABEL_CLASS}>Competition level</span>
          <select
            className={`mt-1 w-full ${INPUT_CLASS}`}
            value={form.competitionLevel}
            onChange={(event) => set("competitionLevel", event.target.value as CompetitionLevel)}
          >
            {COMPETITION_LEVELS_IN_ORDER.map((level) => (
              <option key={level} value={level}>
                {COMPETITION_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-locker-ink-muted">
            Your production is translated to Division I level before it is valued, so be accurate — a
            stronger level counts for more.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className={LABEL_CLASS}>Team (optional)</span>
          <input
            type="text"
            className={`mt-1 w-full ${INPUT_CLASS}`}
            value={form.teamName ?? ""}
            maxLength={120}
            placeholder="e.g. Riverside College"
            onChange={(event) => set("teamName", event.target.value)}
          />
        </label>
      </div>

      {noYearLeft && (
        <p className="mt-3 text-[11.5px] text-locker-ink-muted">
          You already have a season for every recent league year.
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="mt-3 text-[11.5px] text-locker-bad">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className={BUTTON_CLASS} disabled={mutation.isPending || noYearLeft}>
          {mutation.isPending ? "Saving…" : isEditing ? "Save details" : "Start season"}
        </button>
        {onCancel && (
          <button type="button" className={QUIET_BUTTON_CLASS} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
