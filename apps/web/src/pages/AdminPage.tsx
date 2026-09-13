import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminPlayers,
  fetchAdminTeams,
  fetchAdminUsers,
  updateAdminPlayer,
  updateAdminTeam,
  updateAdminUserRole,
  deleteAdminUser,
  type UpdatePlayerParams,
  type UpdateTeamParams,
} from "@/lib/adminApi";
import { fetchTeams } from "@/lib/nbaApi";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { TeamBadge } from "@/components/TeamBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMe } from "@/lib/useMe";
import type { AdminUserSummary, Player, Team, UserRole } from "@/types/nba";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;

const INPUT_CLASS =
  "border border-landing-light bg-landing-hero px-3 py-2 text-[13px] text-landing-ink placeholder:text-locker-ink-muted focus:border-locker-leather focus:outline-none";
const BUTTON_CLASS =
  "border border-landing-light bg-locker-surface px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-landing-ink uppercase transition-colors hover:border-locker-leather disabled:cursor-not-allowed disabled:opacity-40";
const PANEL_CLASS = "border border-landing-light bg-locker-surface p-4";
const LABEL_CLASS = "font-mono text-[9px] tracking-[0.1em] text-locker-ink-muted uppercase";

type AdminTab = "teams" | "players" | "users";
const TABS: { value: AdminTab; label: string }[] = [
  { value: "teams", label: "Teams" },
  { value: "players", label: "Players" },
  { value: "users", label: "Users" },
];

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("teams");

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <div className="mb-6 border border-landing-light bg-locker-surface p-6">
          <h1 className="font-display text-2xl tracking-[0.01em] text-landing-ink uppercase">Admin</h1>
          <p className="mt-2 text-[12.5px] text-locker-ink-muted">
            Edit imported team and player data, and manage user accounts.
          </p>
          <div
            role="radiogroup"
            aria-label="Admin section"
            className="mt-4 inline-flex flex-wrap gap-1 border border-landing-light bg-landing-hero p-1"
          >
            {TABS.map((section) => (
              <button
                key={section.value}
                type="button"
                role="radio"
                aria-checked={tab === section.value}
                onClick={() => setTab(section.value)}
                className={`px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors ${
                  tab === section.value ? "bg-locker-leather text-white" : "text-locker-ink-muted hover:text-landing-ink"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "teams" && <AdminTeamsSection />}
        {tab === "players" && <AdminPlayersSection />}
        {tab === "users" && <AdminUsersSection />}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      <input type={type} className={`mt-1 w-full ${INPUT_CLASS}`} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

// ── Teams ────────────────────────────────────────────────────────────────

function AdminTeamsSection() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["adminTeams", { page, search: debouncedSearchTerm }],
    queryFn: () => fetchAdminTeams({ page, pageSize: PAGE_SIZE, search: debouncedSearchTerm || undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: UpdateTeamParams) => updateAdminTeam(editingTeam!.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminTeams"] });
      setEditingTeam(null);
    },
  });

  function changeSearch(value: string) {
    setSearchTerm(value);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load teams." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      {editingTeam && (
        <TeamEditForm
          team={editingTeam}
          onCancel={() => setEditingTeam(null)}
          onSave={(patch) => updateMutation.mutate(patch)}
          isSaving={updateMutation.isPending}
          error={updateMutation.isError ? "Could not save changes." : null}
        />
      )}

      <input
        aria-label="Search teams"
        className={INPUT_CLASS}
        type="search"
        placeholder="Search teams"
        value={searchTerm}
        onChange={(event) => changeSearch(event.target.value)}
      />

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading teams" />
        </div>
      ) : (
        <div className="overflow-hidden border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {["Team", "Abbr", "Conference", "Division", ""].map((header) => (
                  <th key={header} className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No teams found.
                  </td>
                </tr>
              ) : (
                data?.data.map((team) => (
                  <tr key={team.id} className="border-b border-landing-light last:border-b-0">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 text-[13px] text-landing-ink">
                        <TeamBadge team={team} size="sm" />
                        {team.city} {team.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{team.abbreviation}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-locker-ink-muted">{team.conference}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-locker-ink-muted">{team.division}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" className={BUTTON_CLASS} onClick={() => setEditingTeam(team)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </div>
  );
}

function TeamEditForm({
  team,
  onCancel,
  onSave,
  isSaving,
  error,
}: {
  team: Team;
  onCancel: () => void;
  onSave: (patch: UpdateTeamParams) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(team.name);
  const [abbreviation, setAbbreviation] = useState(team.abbreviation);
  const [city, setCity] = useState(team.city);
  const [conference, setConference] = useState(team.conference);
  const [division, setDivision] = useState(team.division);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSave({
      name,
      abbreviation,
      city,
      conference,
      division,
      logoUrl: logoUrl.trim() === "" ? null : logoUrl.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className={PANEL_CLASS}>
      <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
        Edit {team.city} {team.name}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Abbreviation" value={abbreviation} onChange={setAbbreviation} />
        <Field label="City" value={city} onChange={setCity} />
        <Field label="Conference" value={conference} onChange={setConference} />
        <Field label="Division" value={division} onChange={setDivision} />
        <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} />
      </div>
      {error && <p className="mt-3 text-[12.5px] text-locker-bad">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" className={BUTTON_CLASS} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={BUTTON_CLASS} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Players ──────────────────────────────────────────────────────────────

function AdminPlayersSection() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  // Every team, for the filter dropdown and the edit form's team picker —
  // the public listing already returns the full Team shape this needs, so
  // there's no reason to duplicate that read behind an admin-only endpoint.
  const teamsQuery = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({ pageSize: 100 }) });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["adminPlayers", { page, search: debouncedSearchTerm, teamId: teamFilter }],
    queryFn: () =>
      fetchAdminPlayers({ page, pageSize: PAGE_SIZE, search: debouncedSearchTerm || undefined, teamId: teamFilter }),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: UpdatePlayerParams) => updateAdminPlayer(editingPlayer!.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminPlayers"] });
      setEditingPlayer(null);
    },
  });

  function changeSearch(value: string) {
    setSearchTerm(value);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load players." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      {editingPlayer && (
        <PlayerEditForm
          player={editingPlayer}
          teams={teamsQuery.data?.data ?? []}
          onCancel={() => setEditingPlayer(null)}
          onSave={(patch) => updateMutation.mutate(patch)}
          isSaving={updateMutation.isPending}
          error={updateMutation.isError ? "Could not save changes." : null}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search players"
          className={INPUT_CLASS}
          type="search"
          placeholder="Search players"
          value={searchTerm}
          onChange={(event) => changeSearch(event.target.value)}
        />
        <select
          aria-label="Filter by team"
          className={INPUT_CLASS}
          value={teamFilter ?? ""}
          onChange={(event) => {
            setTeamFilter(event.target.value || undefined);
            setPage(1);
          }}
        >
          <option value="">All teams</option>
          {teamsQuery.data?.data.map((team) => (
            <option key={team.id} value={team.id}>
              {team.city} {team.name}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading players" />
        </div>
      ) : (
        <div className="overflow-hidden border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {["Player", "Team", "Pos", "#", ""].map((header) => (
                  <th key={header} className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No players found.
                  </td>
                </tr>
              ) : (
                data?.data.map((player) => (
                  <tr key={player.id} className="border-b border-landing-light last:border-b-0">
                    <td className="px-3 py-2.5 text-[13px] text-landing-ink">
                      {player.firstName} {player.lastName}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted uppercase">
                      {player.team?.abbreviation ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{player.position}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{player.jerseyNumber ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" className={BUTTON_CLASS} onClick={() => setEditingPlayer(player)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </div>
  );
}

// Covers the fields an admin is realistically fixing by hand (a bad name, a
// missing jersey number, a stale team assignment); the rarer draft-history
// fields (draftYear/Round/Number, seasonExp, rosterStatus, lastAffiliation)
// are still editable via the API but not surfaced here yet.
function PlayerEditForm({
  player,
  teams,
  onCancel,
  onSave,
  isSaving,
  error,
}: {
  player: Player;
  teams: Team[];
  onCancel: () => void;
  onSave: (patch: UpdatePlayerParams) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const [position, setPosition] = useState(player.position);
  const [jerseyNumber, setJerseyNumber] = useState(player.jerseyNumber ?? "");
  const [teamId, setTeamId] = useState(player.teamId ?? "");
  const [heightInches, setHeightInches] = useState(player.heightInches?.toString() ?? "");
  const [weightLbs, setWeightLbs] = useState(player.weightLbs?.toString() ?? "");
  const [school, setSchool] = useState(player.school ?? "");
  const [country, setCountry] = useState(player.country ?? "");
  // A date input wants "YYYY-MM-DD"; birthDate arrives as a full ISO
  // timestamp, so only its date portion is kept.
  const [birthDate, setBirthDate] = useState(player.birthDate?.slice(0, 10) ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSave({
      firstName,
      lastName,
      position,
      jerseyNumber: jerseyNumber.trim() === "" ? null : jerseyNumber.trim(),
      teamId: teamId === "" ? null : teamId,
      heightInches: heightInches.trim() === "" ? null : Number(heightInches),
      weightLbs: weightLbs.trim() === "" ? null : Number(weightLbs),
      school: school.trim() === "" ? null : school.trim(),
      country: country.trim() === "" ? null : country.trim(),
      birthDate: birthDate.trim() === "" ? null : birthDate,
    });
  }

  return (
    <form onSubmit={handleSubmit} className={PANEL_CLASS}>
      <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">
        Edit {player.firstName} {player.lastName}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
        <Field label="Position" value={position} onChange={setPosition} />
        <Field label="Jersey #" value={jerseyNumber} onChange={setJerseyNumber} />
        <label className="block">
          <span className={LABEL_CLASS}>Team</span>
          <select className={`mt-1 w-full ${INPUT_CLASS}`} value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">Free agent</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.city} {team.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="Height (inches)" value={heightInches} onChange={setHeightInches} type="number" />
        <Field label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} type="number" />
        <Field label="Birth date" value={birthDate} onChange={setBirthDate} type="date" />
        <Field label="School" value={school} onChange={setSchool} />
        <Field label="Country" value={country} onChange={setCountry} />
      </div>
      {error && <p className="mt-3 text-[12.5px] text-locker-bad">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" className={BUTTON_CLASS} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={BUTTON_CLASS} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Users ────────────────────────────────────────────────────────────────

function AdminUsersSection() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);
  // Which row currently has its confirm step armed — lifted up here (rather
  // than local to each row) so a successful mutation can close it back down;
  // a row-local flag would survive the list's refetch after invalidation
  // and get stuck open.
  const [confirmingRoleFor, setConfirmingRoleFor] = useState<string | null>(null);
  const [confirmingDeleteFor, setConfirmingDeleteFor] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["adminUsers", { page, search: debouncedSearchTerm }],
    queryFn: () => fetchAdminUsers({ page, pageSize: PAGE_SIZE, search: debouncedSearchTerm || undefined }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => updateAdminUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      setConfirmingRoleFor(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteAdminUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      setConfirmingDeleteFor(null);
    },
  });

  function changeSearch(value: string) {
    setSearchTerm(value);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load users." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <input
        aria-label="Search users"
        className={INPUT_CLASS}
        type="search"
        placeholder="Search by email, name, or username"
        value={searchTerm}
        onChange={(event) => changeSearch(event.target.value)}
      />

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading users" />
        </div>
      ) : (
        <div className="overflow-hidden border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {["User", "Role", "Joined", ""].map((header) => (
                  <th key={header} className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                data?.data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === me?.id}
                    isConfirmingRole={confirmingRoleFor === user.id}
                    isConfirmingDelete={confirmingDeleteFor === user.id}
                    isRoleSaving={roleMutation.isPending && roleMutation.variables?.userId === user.id}
                    isDeleteSaving={deleteMutation.isPending && deleteMutation.variables === user.id}
                    roleError={roleMutation.isError && roleMutation.variables?.userId === user.id ? "Could not update role." : null}
                    deleteError={deleteMutation.isError && deleteMutation.variables === user.id ? "Could not delete user." : null}
                    onRequestRoleConfirm={() => setConfirmingRoleFor(user.id)}
                    onCancelRoleConfirm={() => setConfirmingRoleFor(null)}
                    onConfirmRole={(role) => roleMutation.mutate({ userId: user.id, role })}
                    onRequestDeleteConfirm={() => setConfirmingDeleteFor(user.id)}
                    onCancelDeleteConfirm={() => setConfirmingDeleteFor(null)}
                    onConfirmDelete={() => deleteMutation.mutate(user.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination tone="locker" page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
    </div>
  );
}

interface UserRowProps {
  user: AdminUserSummary;
  isSelf: boolean;
  isConfirmingRole: boolean;
  isConfirmingDelete: boolean;
  isRoleSaving: boolean;
  isDeleteSaving: boolean;
  roleError: string | null;
  deleteError: string | null;
  onRequestRoleConfirm: () => void;
  onCancelRoleConfirm: () => void;
  onConfirmRole: (role: UserRole) => void;
  onRequestDeleteConfirm: () => void;
  onCancelDeleteConfirm: () => void;
  onConfirmDelete: () => void;
}

// Two-click confirm rather than a modal, matching AuthStatus's
// DeleteAccountControl — arms on the first click, the second either
// commits or a plain Cancel stands down. isSelf disables both actions
// entirely (the API enforces the same rule; this is the friendlier
// front-line version of that same guard rather than a 400 after the fact).
function UserRow({
  user,
  isSelf,
  isConfirmingRole,
  isConfirmingDelete,
  isRoleSaving,
  isDeleteSaving,
  roleError,
  deleteError,
  onRequestRoleConfirm,
  onCancelRoleConfirm,
  onConfirmRole,
  onRequestDeleteConfirm,
  onCancelDeleteConfirm,
  onConfirmDelete,
}: UserRowProps) {
  const isAdmin = user.role === "ADMIN";

  return (
    <tr className="border-b border-landing-light last:border-b-0">
      <td className="px-3 py-2.5">
        <div className="text-[13px] text-landing-ink">
          {user.name} {isSelf && <span className="text-locker-ink-muted">(you)</span>}
        </div>
        <div className="text-[11px] text-locker-ink-muted">{user.email}</div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-locker-ink-muted uppercase">{user.role}</td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2.5 text-right">
        {isSelf ? (
          <span className="font-mono text-[10px] text-locker-ink-muted uppercase">—</span>
        ) : isConfirmingRole ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[11.5px] text-locker-ink-muted">
              {roleError ?? `${isAdmin ? "Remove" : "Grant"} admin access?`}
            </span>
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={isRoleSaving}
              onClick={() => onConfirmRole(isAdmin ? "USER" : "ADMIN")}
            >
              {isRoleSaving ? "Saving…" : "Yes"}
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={onCancelRoleConfirm}>
              Cancel
            </button>
          </span>
        ) : isConfirmingDelete ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[11.5px] text-locker-bad">{deleteError ?? "Delete this account?"}</span>
            <button type="button" className={BUTTON_CLASS} disabled={isDeleteSaving} onClick={onConfirmDelete}>
              {isDeleteSaving ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={onCancelDeleteConfirm}>
              Cancel
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onRequestRoleConfirm}>
              {isAdmin ? "Remove admin" : "Make admin"}
            </button>
            <button type="button" className={`${BUTTON_CLASS} text-locker-bad`} onClick={onRequestDeleteConfirm}>
              Delete
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
