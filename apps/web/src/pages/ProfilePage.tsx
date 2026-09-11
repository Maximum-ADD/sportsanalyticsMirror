import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { TeamBadge } from "@/components/TeamBadge";
import { TeamPicker } from "@/components/TeamPicker";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { authClient } from "@/lib/authClient";
import { updateMe, uploadAvatar, unfollowPlayer } from "@/lib/meApi";
import { ME_QUERY_KEY, useMe } from "@/lib/useMe";
import { ApiError } from "@/lib/apiClient";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE_MB } from "@/lib/avatar";
import type { Team } from "@/types/nba";

const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <h2 className="font-display text-sm tracking-[0.2em] whitespace-nowrap text-locker-ink-muted uppercase">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-landing-light" />
    </div>
  );
}

function LockerButton({
  children,
  onClick,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  const dangerClass = variant === "danger" ? "border-locker-bad text-locker-bad hover:bg-locker-bad/10" : "hover:border-locker-leather text-landing-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border border-landing-light bg-locker-surface px-4 py-2 font-mono text-[10.5px] tracking-[0.14em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${dangerClass}`}
    >
      {children}
    </button>
  );
}

function AvatarEditor({ avatarUrl, username, name }: { avatarUrl: string | null; username: string | null; name: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setPreviewUrl(null);
    },
    onError: () => {
      setErrorMessage("Couldn't upload that image. Please try again.");
      setPreviewUrl(null);
    },
  });

  function handleFileChosen(file: File | undefined) {
    if (!file) return;
    setErrorMessage(null);

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) {
      setErrorMessage("Only PNG, JPEG, and WebP images are supported.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`Image must be ${MAX_AVATAR_SIZE_MB}MB or smaller.`);
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    uploadMutation.mutate(file);
  }

  const displayedUrl = previewUrl ?? avatarUrl;
  const initial = (username ?? name)[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-4">
      {displayedUrl ? (
        <img src={displayedUrl} alt="" className="size-20 shrink-0 object-cover" />
      ) : (
        <div className="flex size-20 shrink-0 items-center justify-center bg-locker-leather font-display text-2xl text-white">
          {initial}
        </div>
      )}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_AVATAR_MIME_TYPES.join(",")}
          className="sr-only"
          onChange={(event) => handleFileChosen(event.target.files?.[0])}
        />
        <LockerButton onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? "Uploading…" : "Change avatar"}
        </LockerButton>
        {errorMessage && <p className="mt-2 text-[11.5px] text-locker-bad">{errorMessage}</p>}
      </div>
    </div>
  );
}

function UsernameEditor({ currentUsername }: { currentUsername: string }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentUsername);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (username: string) => updateMe({ username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        setErrorMessage("That username is already taken.");
      } else {
        setErrorMessage("Couldn't save that username. Please try again.");
      }
    },
  });

  if (!isEditing) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-display text-lg text-landing-ink uppercase">{currentUsername}</span>
        <LockerButton
          onClick={() => {
            setValue(currentUsername);
            setErrorMessage(null);
            setIsEditing(true);
          }}
        >
          Change username
        </LockerButton>
      </div>
    );
  }

  const isValidFormat = USERNAME_PATTERN.test(value.trim());

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          className="max-w-56 border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink focus:border-locker-leather focus:outline-none"
        />
        <LockerButton
          onClick={() => updateMutation.mutate(value.trim())}
          disabled={!isValidFormat || updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving…" : "Save"}
        </LockerButton>
        <LockerButton onClick={() => setIsEditing(false)}>Cancel</LockerButton>
      </div>
      {value.trim().length > 0 && !isValidFormat && (
        <p className="mt-2 text-[11.5px] text-locker-bad">
          3-20 characters, starting with a letter — letters, numbers, and underscores only.
        </p>
      )}
      {errorMessage && <p className="mt-2 text-[11.5px] text-locker-bad">{errorMessage}</p>}
    </div>
  );
}

function FavoriteTeamEditor({ favoriteTeam }: { favoriteTeam: Team | null }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<Team | null>(favoriteTeam);

  const updateMutation = useMutation({
    mutationFn: (teamId: string) => updateMe({ favoriteTeamId: teamId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setIsEditing(false);
    },
  });

  if (!isEditing) {
    return (
      <div className="flex items-center gap-3">
        {favoriteTeam ? (
          <>
            <TeamBadge team={favoriteTeam} size="md" />
            <span className="font-display text-lg text-landing-ink uppercase">
              {favoriteTeam.city} {favoriteTeam.name}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-locker-ink-muted">No favorite team set.</span>
        )}
        <LockerButton onClick={() => setIsEditing(true)}>{favoriteTeam ? "Change team" : "Pick a team"}</LockerButton>
      </div>
    );
  }

  return (
    <div>
      <TeamPicker selectedTeamId={selected?.id ?? null} onSelect={setSelected} />
      <div className="mt-3 flex gap-2.5">
        <LockerButton
          onClick={() => selected && updateMutation.mutate(selected.id)}
          disabled={!selected || updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving…" : "Save"}
        </LockerButton>
        <LockerButton onClick={() => setIsEditing(false)}>Cancel</LockerButton>
      </div>
    </div>
  );
}

function FollowedPlayersList({ players }: { players: { id: string; firstName: string; lastName: string; nbaPlayerId: number; position: string; team: Team | null }[] }) {
  const queryClient = useQueryClient();
  const unfollowMutation = useMutation({
    mutationFn: (playerId: string) => unfollowPlayer(playerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });

  if (players.length === 0) {
    return (
      <p className="border border-dashed border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
        You're not following any players yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((player) => (
        <div key={player.id} className="flex items-center gap-2.5 border border-landing-light bg-locker-surface p-2.5">
          <PlayerHeadshot player={player} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[12.5px] text-landing-ink uppercase">
              {player.firstName} {player.lastName}
            </p>
            <p className="truncate text-[10.5px] text-locker-ink-muted">
              {player.team ? `${player.team.abbreviation} · ` : ""}
              {player.position}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Unfollow ${player.firstName} ${player.lastName}`}
            onClick={() => unfollowMutation.mutate(player.id)}
            disabled={unfollowMutation.isPending}
            className="shrink-0 border border-landing-light p-1 text-locker-ink-muted transition-colors hover:border-locker-bad hover:text-locker-bad disabled:opacity-50"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Two-click confirm, same pattern as AuthStatus.tsx's original
// DeleteAccountControl (ported here since the header dropdown it lived in
// is gone — see LandingHeader), restyled to the locker system.
function DeleteAccountControl() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirmDelete() {
    setStatus("pending");
    setErrorMessage(null);
    const { error } = await authClient.deleteUser();
    if (error) {
      setStatus("error");
      setErrorMessage(error.message ?? "Couldn't delete your account. Please try again.");
      return;
    }
    // On success BetterAuth clears the session cookie; useSession() picks
    // that up and ProtectedRoute takes over from there.
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[12.5px] text-locker-bad">
          {errorMessage ?? "Delete your account? This can't be undone."}
        </span>
        {!errorMessage && (
          <>
            <LockerButton variant="danger" onClick={handleConfirmDelete} disabled={status === "pending"}>
              {status === "pending" ? "Deleting…" : "Yes, delete"}
            </LockerButton>
            <LockerButton onClick={() => setConfirming(false)}>Cancel</LockerButton>
          </>
        )}
        {errorMessage && (
          <LockerButton
            onClick={() => {
              setConfirming(false);
              setStatus("idle");
              setErrorMessage(null);
            }}
          >
            Dismiss
          </LockerButton>
        )}
      </div>
    );
  }

  return (
    <LockerButton variant="danger" onClick={() => setConfirming(true)}>
      Delete account
    </LockerButton>
  );
}

export function ProfilePage() {
  const { data: me, isPending, isError, refetch } = useMe();
  const navigate = useNavigate();

  if (isPending) {
    return (
      <div className="flex min-h-full items-center justify-center bg-landing-hero">
        <BasketballSpinner size="lg" label="Loading profile" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="border border-landing-light bg-locker-surface p-5 text-center text-[12.5px] text-locker-ink-muted">
          Could not load your profile.{" "}
          <button type="button" onClick={() => refetch()} className="underline hover:text-landing-ink">
            Try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Profile</h1>
          <p className="mt-2 text-[12.5px] text-locker-ink-muted">{me.email}</p>
        </div>

        <div className="mb-6">
          <SectionHeading>Avatar</SectionHeading>
          <AvatarEditor avatarUrl={me.avatarUrl} username={me.username} name={me.name} />
        </div>

        <div className="mb-6">
          <SectionHeading>Username</SectionHeading>
          {me.username && <UsernameEditor currentUsername={me.username} />}
        </div>

        <div className="mb-6">
          <SectionHeading>Favorite team</SectionHeading>
          <FavoriteTeamEditor favoriteTeam={me.favoriteTeam} />
        </div>

        <div className="mb-6">
          <SectionHeading>Followed players</SectionHeading>
          <FollowedPlayersList players={me.followedPlayers} />
        </div>

        <div className="border-t border-landing-light pt-6">
          <SectionHeading>Account</SectionHeading>
          <div className="flex flex-wrap items-center gap-2.5">
            <LockerButton
              onClick={async () => {
                await authClient.signOut();
                navigate("/");
              }}
            >
              Sign out
            </LockerButton>
            <DeleteAccountControl />
          </div>
        </div>
      </div>
    </div>
  );
}
