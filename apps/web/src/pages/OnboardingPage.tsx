import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { TeamPicker } from "@/components/TeamPicker";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { PageLoading } from "@/components/ui/loading-overlay";
import { updateMe, followPlayer, fetchSuggestedPlayers } from "@/lib/meApi";
import { ME_QUERY_KEY, useMe } from "@/lib/useMe";
import { ApiError } from "@/lib/apiClient";
import type { Team } from "@/types/nba";

type Step = "username" | "team" | "players";

const STEPS: Step[] = ["username", "team", "players"];

// Debounced live-validation ping against PATCH /v1/me — reusing the update
// endpoint itself (rather than a dedicated availability-check route this
// app doesn't have) means "is this taken" and "save this" can never
// disagree about what counts as valid/available, since they're the exact
// same check.
const USERNAME_DEBOUNCE_MS = 400;

// Client-side mirror of MeService's USERNAME_PATTERN — checked before ever
// firing a request, so an obviously-invalid keystroke doesn't round-trip.
const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

const SUGGESTED_PLAYER_COUNT = 8;

interface StepHeaderProps {
  step: Step;
  stepNumber: number;
}

function StepHeader({ step, stepNumber }: StepHeaderProps) {
  const titles: Record<Step, string> = {
    username: "Choose a username",
    team: "Pick your team",
    players: "Follow a few players",
  };
  const descriptions: Record<Step, string> = {
    username: "This is how you'll show up around the app.",
    team: "The one team you support — you can change this later from your profile.",
    players: "Optional — ranked by usage rate, the players who run this team's offense. Skip if you'd rather decide later.",
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-locker-ink-muted uppercase">
          Step {stepNumber} of {STEPS.length}
        </span>
        <span aria-hidden className="h-px flex-1 bg-landing-light" />
      </div>
      <h1 className="mt-3 font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">{titles[step]}</h1>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-locker-ink-muted">{descriptions[step]}</p>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border border-locker-leather bg-locker-leather px-6 py-2.5 font-mono text-[10.5px] tracking-[0.14em] text-white uppercase transition-colors hover:bg-locker-leather/90 disabled:cursor-not-allowed disabled:border-landing-light disabled:bg-locker-surface disabled:text-locker-ink-muted"
    >
      {children}
    </button>
  );
}

function UsernameStep({ onNext }: { onNext: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const debouncedUsername = useDebouncedValue(username.trim(), USERNAME_DEBOUNCE_MS);
  const isValidFormat = USERNAME_PATTERN.test(debouncedUsername);

  // Live-validated via a dry-run PATCH is overkill here — instead this
  // reuses the exact same isUsernameTaken signal the real submit will hit,
  // by attempting the PATCH speculatively is too heavy (it would actually
  // save on every keystroke pause). Simpler and just as honest: submit
  // attempts the real PATCH, and a 409 surfaces inline — see handleSubmit.
  const [takenError, setTakenError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit() {
    if (!isValidFormat) return;
    setIsChecking(true);
    setTakenError(null);
    try {
      await updateMe({ username: debouncedUsername });
      onNext(debouncedUsername);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setTakenError("That username is already taken.");
      } else {
        setTakenError("Couldn't save that username. Please try again.");
      }
    } finally {
      setIsChecking(false);
    }
  }

  const showFormatHint = username.trim().length > 0 && !isValidFormat;

  return (
    <div>
      <label htmlFor="onboarding-username" className="sr-only">
        Username
      </label>
      <input
        id="onboarding-username"
        type="text"
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
          setTakenError(null);
        }}
        placeholder="e.g. hoopsfan23"
        autoComplete="off"
        className="w-full max-w-sm border border-landing-light bg-landing-hero px-3 py-2.5 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none"
      />
      {showFormatHint && (
        <p className="mt-2 text-[11.5px] text-locker-bad">
          3-20 characters, starting with a letter — letters, numbers, and underscores only.
        </p>
      )}
      {takenError && <p className="mt-2 text-[11.5px] text-locker-bad">{takenError}</p>}

      <div className="mt-6">
        <PrimaryButton onClick={handleSubmit} disabled={!isValidFormat || isChecking}>
          {isChecking ? "Checking…" : "Continue"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function TeamStep({ onNext }: { onNext: (team: Team) => void }) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    if (!selectedTeam) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateMe({ favoriteTeamId: selectedTeam.id });
      onNext(selectedTeam);
    } catch {
      setErrorMessage("Couldn't save your favorite team. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <TeamPicker selectedTeamId={selectedTeam?.id ?? null} onSelect={setSelectedTeam} />
      {errorMessage && <p className="mt-3 text-[11.5px] text-locker-bad">{errorMessage}</p>}
      <div className="mt-6">
        <PrimaryButton onClick={handleSubmit} disabled={!selectedTeam || isSaving}>
          {isSaving ? "Saving…" : "Continue"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function PlayersStep({ team, onFinish }: { team: Team; onFinish: () => void }) {
  const suggestedQuery = useQuery({
    queryKey: ["suggestedPlayers", team.id],
    queryFn: () => fetchSuggestedPlayers(team.id, SUGGESTED_PLAYER_COUNT),
  });
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  const followMutation = useMutation({
    mutationFn: (playerId: string) => followPlayer(playerId),
  });

  function toggleFollow(playerId: string) {
    const alreadyFollowed = followedIds.has(playerId);
    if (!alreadyFollowed) {
      followMutation.mutate(playerId);
    }
    setFollowedIds((current) => {
      const next = new Set(current);
      if (alreadyFollowed) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  const players = suggestedQuery.data?.players ?? [];

  return (
    <div>
      {suggestedQuery.isPending && (
        <div className="flex justify-center border border-landing-light bg-locker-surface py-10">
          <BasketballSpinner size="md" label="Loading suggested players" />
        </div>
      )}

      {suggestedQuery.isSuccess && players.length === 0 && (
        <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
          No roster data available for this team yet.
        </p>
      )}

      {suggestedQuery.isSuccess && players.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {players.map(({ player, usagePercentage }) => {
            const isFollowed = followedIds.has(player.id);
            return (
              <button
                key={player.id}
                type="button"
                aria-pressed={isFollowed}
                onClick={() => toggleFollow(player.id)}
                className={`flex flex-col items-center gap-2 border p-3 text-center transition-colors ${
                  isFollowed
                    ? "border-locker-leather bg-locker-leather/10"
                    : "border-landing-light bg-locker-surface hover:border-locker-leather"
                }`}
              >
                <div className="relative">
                  <PlayerHeadshot player={player} size="sm" />
                  {isFollowed && (
                    <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-locker-leather text-white">
                      <Check aria-hidden className="size-2.5" />
                    </span>
                  )}
                </div>
                <span className="font-display text-[11.5px] text-landing-ink uppercase">
                  {player.firstName} {player.lastName}
                </span>
                <span className="font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase">
                  {usagePercentage !== null ? `${usagePercentage}% usage` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex gap-2.5">
        <PrimaryButton onClick={onFinish}>{followedIds.size > 0 ? "Finish" : "Skip"}</PrimaryButton>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const [step, setStep] = useState<Step>("username");
  const [team, setTeam] = useState<Team | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isPending: isMePending, data: me } = useMe();

  // Someone who already onboarded (has a username) shouldn't be able to
  // navigate back here and re-run the flow — send them straight to /home,
  // same destination onboarding itself finishes at.
  if (!isMePending && me?.username) {
    navigate("/home", { replace: true });
    return null;
  }

  if (isMePending) {
    return (
      <div className="min-h-full bg-landing-hero">
        <PageLoading label="Loading" />
      </div>
    );
  }

  const stepNumber = STEPS.indexOf(step) + 1;

  function finish() {
    // Refetches GET /v1/me so the username set in step 1 is reflected
    // immediately — without this, the ProfileGate redirect logic would
    // still see the stale null username from before onboarding and bounce
    // straight back here.
    queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    navigate("/home", { replace: true });
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="border border-landing-light bg-locker-surface p-6">
          <StepHeader step={step} stepNumber={stepNumber} />

          {step === "username" && <UsernameStep onNext={() => setStep("team")} />}
          {step === "team" && (
            <TeamStep
              onNext={(selectedTeam) => {
                setTeam(selectedTeam);
                setStep("players");
              }}
            />
          )}
          {step === "players" && team && <PlayersStep team={team} onFinish={finish} />}
        </div>
      </div>
    </div>
  );
}
