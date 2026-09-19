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
  fetchAdminBatches,
  approveAdminBatch,
  rejectAdminBatch,
  fetchAdminConsumers,
  createAdminConsumer,
  createAdminApiKey,
  revokeAdminApiKey,
  deleteAdminConsumer,
  deleteAdminApiKey,
  fetchIngestionSchedule,
  updateIngestionSchedule,
  triggerIngestionPull,
  deleteIngestionBatch,
  type UpdatePlayerParams,
  type UpdateTeamParams,
  type IngestionFrequency,
  type BatchSortField,
  type SortDirection,
} from "@/lib/adminApi";
import { fetchTeams } from "@/lib/nbaApi";
import { AdminCorrectionsSection } from "@/components/admin/AdminCorrectionsSection";
import { BUTTON_CLASS, INPUT_CLASS, LABEL_CLASS, PAGE_SIZE, PANEL_CLASS } from "@/components/admin/adminStyles";
import { BasketballSpinner } from "@/components/ui/basketball-spinner";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { PullQueuePanel } from "@/components/PullQueuePanel";
import { PULL_REQUESTS_QUERY_KEY } from "@/lib/pullQueue";
import { TeamBadge } from "@/components/TeamBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMe } from "@/lib/useMe";
import type { AdminUserSummary, Player, Team, UserRole } from "@/types/nba";

const SEARCH_DEBOUNCE_IN_MILLISECONDS = 300;

const PULL_LABEL_CLASS = "font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase";

type AdminTab = "teams" | "players" | "users" | "batches" | "corrections" | "consumers";
const TABS: { value: AdminTab; label: string }[] = [
  { value: "teams", label: "Teams" },
  { value: "players", label: "Players" },
  { value: "users", label: "Users" },
  { value: "batches", label: "Batches" },
  { value: "corrections", label: "Corrections" },
  { value: "consumers", label: "API Keys" },
];

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("teams");
  // The game open in the Corrections tab. Lives here so a batch row can
  // open its game there directly.
  const [correctionsGameId, setCorrectionsGameId] = useState<string | null>(null);

  function openCorrections(gameId: string) {
    setCorrectionsGameId(gameId);
    setTab("corrections");
  }

  return (
    <div className="min-h-full bg-landing-hero">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 border border-landing-light bg-locker-surface p-4 sm:p-6">
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
                className={`min-h-9 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors sm:min-h-0 sm:px-2.5 ${
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
        {tab === "batches" && <AdminBatchesSection onCorrectPlays={openCorrections} />}
        {tab === "corrections" && (
          <AdminCorrectionsSection selectedGameId={correctionsGameId} onSelectGame={setCorrectionsGameId} />
        )}
        {tab === "consumers" && <AdminConsumersSection />}
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
        <div className="overflow-x-auto border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {/* Conference and division are the columns an admin scans
                    past on a phone — the edit control and the team's identity
                    are what the row is for. Each column's visibility is
                    declared once and applied to its body cell to match. */}
                {[
                  { label: "Team", className: "" },
                  { label: "Abbr", className: "" },
                  { label: "Conference", className: "hidden md:table-cell" },
                  { label: "Division", className: "hidden lg:table-cell" },
                  { label: "", className: "" },
                ].map((column) => (
                  <th key={column.label} className={`px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase ${column.className}`}>
                    {column.label}
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
                    <td className="hidden px-3 py-2.5 text-[12.5px] text-locker-ink-muted md:table-cell">
                      {team.conference}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[12.5px] text-locker-ink-muted lg:table-cell">
                      {team.division}
                    </td>
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
        <div className="overflow-x-auto border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {[
                  { label: "Player", className: "" },
                  { label: "Team", className: "" },
                  { label: "Pos", className: "hidden md:table-cell" },
                  { label: "#", className: "hidden md:table-cell" },
                  { label: "", className: "" },
                ].map((column) => (
                  <th key={column.label} className={`px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase ${column.className}`}>
                    {column.label}
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
                    <td className="hidden px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted md:table-cell">
                      {player.position}
                    </td>
                    <td className="hidden px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted md:table-cell">
                      {player.jerseyNumber ?? "—"}
                    </td>
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
        <div className="overflow-x-auto border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {[
                  { label: "User", className: "" },
                  { label: "Role", className: "" },
                  { label: "Joined", className: "hidden md:table-cell" },
                  { label: "", className: "" },
                ].map((column) => (
                  <th key={column.label} className={`px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase ${column.className}`}>
                    {column.label}
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
      <td className="hidden px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted md:table-cell">
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

// ── Batches (Submission Review) ───────────────────────────────────────

// Batch table columns. A sortField makes the header a sort toggle; the
// rest are plain labels. Game date is sortable because one pull creates
// hundreds of batches at once, so the list is unreadable ordered by
// anything else.
const BATCH_TABLE_HEADERS: { label: string; sortField?: BatchSortField }[] = [
  { label: "Game" },
  { label: "Date", sortField: "date" },
  { label: "Season", sortField: "season" },
  { label: "Status" },
  { label: "Accepted" },
  { label: "Rejected" },
  { label: "Ingested", sortField: "ingested" },
  { label: "Reviewer" },
  { label: "" },
];

function AdminBatchesSection({ onCorrectPlays }: { onCorrectPlays: (gameId: string) => void }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING_REVIEW");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<BatchSortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), SEARCH_DEBOUNCE_IN_MILLISECONDS);

  // Date window for the next manual pull. Empty means "everything the pull
  // would have covered before" — the whole current season's recent games.
  const [pullSeason, setPullSeason] = useState("");
  const [pullFromDate, setPullFromDate] = useState("");
  const [pullToDate, setPullToDate] = useState("");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["adminBatches", { page, status: statusFilter, search: debouncedSearchTerm, sortField, sortDirection }],
    queryFn: () =>
      fetchAdminBatches({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
        search: debouncedSearchTerm || undefined,
        sort: sortField,
        order: sortDirection,
      }),
  });

  /**
   * Toggles direction when the same column is clicked again, and starts a
   * new column newest-first. Re-sorting reorders the whole list, so page 2
   * of the old order is meaningless in the new one — go back to page 1.
   */
  function sortByColumn(field: BatchSortField) {
    setSortDirection((previousDirection) =>
      field === sortField && previousDirection === "desc" ? "asc" : "desc",
    );
    setSortField(field);
    setPage(1);
  }

  const { data: scheduleData, refetch: refetchSchedule } = useQuery({
    queryKey: ["ingestionSchedule"],
    queryFn: () => fetchIngestionSchedule(),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => approveAdminBatch(id, notes),
    onSuccess: () => refetch(),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => rejectAdminBatch(id, notes),
    onSuccess: () => refetch(),
  });

  const pullMutation = useMutation({
    mutationFn: () =>
      triggerIngestionPull({
        season: pullSeason.trim() || undefined,
        fromDate: pullFromDate || undefined,
        toDate: pullToDate || undefined,
      }),
    onSuccess: () => {
      refetch();
      refetchSchedule();
      queryClient.invalidateQueries({ queryKey: PULL_REQUESTS_QUERY_KEY });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (frequency: IngestionFrequency) => updateIngestionSchedule(frequency),
    onSuccess: () => refetchSchedule(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteIngestionBatch(id),
    onSuccess: () => refetch(),
  });

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  function changeSearch(value: string) {
    setSearchTerm(value);
    setPage(1);
  }

  if (isError) {
    return <ErrorState message="Could not load batches." onRetry={() => refetch()} />;
  }

  // Where the API can't run pulls itself (the deployed site), they're queued
  // for a pull worker and the queue is shown below the controls.
  const isQueueMode = scheduleData?.pullMode === "queue";
  const hasPullWindow = Boolean(pullSeason || pullFromDate || pullToDate);

  return (
    <div className="space-y-4">
      {/* Pull Data & Schedule Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-landing-light bg-landing-hero px-3 py-2.5">
        <button
          type="button"
          className={`${BUTTON_CLASS} border-orange-400 text-orange-700`}
          disabled={pullMutation.isPending}
          onClick={() => pullMutation.mutate()}
        >
          {pullMutation.isPending ? "Pulling..." : "Pull Data"}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="pull-season" className={PULL_LABEL_CLASS}>
            Season
          </label>
          <input
            id="pull-season"
            className={`${INPUT_CLASS} w-28`}
            placeholder="2025-26"
            value={pullSeason}
            onChange={(event) => setPullSeason(event.target.value)}
          />
          <label htmlFor="pull-from-date" className={PULL_LABEL_CLASS}>
            From
          </label>
          <input
            id="pull-from-date"
            type="date"
            className={INPUT_CLASS}
            value={pullFromDate}
            onChange={(event) => setPullFromDate(event.target.value)}
          />
          <label htmlFor="pull-to-date" className={PULL_LABEL_CLASS}>
            To
          </label>
          <input
            id="pull-to-date"
            type="date"
            className={INPUT_CLASS}
            value={pullToDate}
            onChange={(event) => setPullToDate(event.target.value)}
          />
          {hasPullWindow && (
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => {
                setPullSeason("");
                setPullFromDate("");
                setPullToDate("");
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="font-mono text-[10px] tracking-[0.08em] text-locker-ink-muted uppercase">
            Schedule:
          </label>
          <select
            aria-label="Pull schedule"
            className={INPUT_CLASS}
            value={scheduleData?.frequency ?? "NEVER"}
            onChange={(e) => scheduleMutation.mutate(e.target.value as IngestionFrequency)}
          >
            <option value="NEVER">Never (manual only)</option>
            <option value="HOURLY">Hourly</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </div>
        {scheduleData?.lastRunAt && (
          <span className="font-mono text-[10px] text-locker-ink-muted">
            Last run: {new Date(scheduleData.lastRunAt).toLocaleString()}
          </span>
        )}
        {pullMutation.isSuccess && pullMutation.data.started && (
          <span className="text-[11px] text-green-600">{pullMutation.data.message}</span>
        )}
        {pullMutation.isSuccess && !pullMutation.data.started && (
          <span className="text-[11px] text-yellow-600">{pullMutation.data.message}</span>
        )}
        {pullMutation.isError && (
          <span className="text-[11px] text-locker-bad">Failed to trigger pull</span>
        )}
      </div>

      {isQueueMode && <PullQueuePanel workerLastSeenAt={scheduleData?.workerLastSeenAt ?? null} />}

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search batches"
          className={INPUT_CLASS}
          type="search"
          placeholder="Search by game ID or team"
          value={searchTerm}
          onChange={(event) => changeSearch(event.target.value)}
        />
        <select
          aria-label="Filter by status"
          className={INPUT_CLASS}
          value={statusFilter}
          onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
          <option value="RUNNING">Running</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading batches" />
        </div>
      ) : (
        <div className="overflow-hidden border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {BATCH_TABLE_HEADERS.map((header) => {
                  const columnSortField = header.sortField;
                  const isSortedColumn = columnSortField !== undefined && columnSortField === sortField;
                  return (
                    <th
                      key={header.label}
                      className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase"
                      aria-sort={
                        columnSortField === undefined
                          ? undefined
                          : isSortedColumn
                            ? sortDirection === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                      }
                    >
                      {columnSortField === undefined ? (
                        header.label
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1 uppercase transition-colors hover:text-landing-ink"
                          onClick={() => sortByColumn(columnSortField)}
                        >
                          {header.label}
                          <span aria-hidden>
                            {isSortedColumn ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 ? (
                <tr>
                  <td colSpan={BATCH_TABLE_HEADERS.length} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No batches found.
                  </td>
                </tr>
              ) : (
                data?.data.map((batch) => (
                  <tr key={batch.id} className="border-b border-landing-light last:border-b-0">
                    <td className="px-3 py-2.5">
                      <div className="text-[13px] text-landing-ink">
                        {batch.game.awayTeam.name} @ {batch.game.homeTeam.name}
                      </div>
                      <div className="font-mono text-[10px] text-locker-ink-muted">{batch.game.nbaGameId}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-locker-ink-muted">
                      {new Date(batch.game.gameDate).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-locker-ink-muted">
                      {batch.game.season}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${
                        batch.status === "PENDING_REVIEW" ? "bg-yellow-100 text-yellow-800" :
                        batch.status === "COMPLETED" ? "bg-green-100 text-green-800" :
                        batch.status === "REJECTED" ? "bg-red-100 text-red-800" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {batch.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{batch.eventsAccepted}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{batch.eventsRejected}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-locker-ink-muted">
                      {new Date(batch.startedAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">
                      {batch.reviewedBy?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        {batch.status === "PENDING_REVIEW" && (
                          <>
                            <input
                              className={`${INPUT_CLASS} w-32`}
                              placeholder="Notes"
                              value={reviewNotes[batch.id] ?? ""}
                              onChange={(e) => setReviewNotes((prev) => ({ ...prev, [batch.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              className={`${BUTTON_CLASS} border-green-300 text-green-700`}
                              onClick={() => approveMutation.mutate({ id: batch.id, notes: reviewNotes[batch.id] })}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className={`${BUTTON_CLASS} border-red-300 text-locker-bad`}
                              onClick={() => rejectMutation.mutate({ id: batch.id, notes: reviewNotes[batch.id] })}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button type="button" className={BUTTON_CLASS} onClick={() => onCorrectPlays(batch.game.id)}>
                          Correct plays
                        </button>
                        <button
                          type="button"
                          className={`${BUTTON_CLASS} border-gray-300 text-gray-600`}
                          onClick={() => {
                            if (confirm("Delete this batch? The game data will be removed from the system.")) {
                              deleteMutation.mutate(batch.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </span>
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

// ── API Consumers (API Keys) ──────────────────────────────────────

function AdminConsumersSection() {
  const [page, setPage] = useState(1);
  const [newConsumerName, setNewConsumerName] = useState("");
  const [newConsumerEmail, setNewConsumerEmail] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["adminConsumers", { page }],
    queryFn: () => fetchAdminConsumers({ page, pageSize: PAGE_SIZE }),
  });

  const createMutation = useMutation({
    mutationFn: () => createAdminConsumer({ name: newConsumerName, contactEmail: newConsumerEmail || undefined }),
    onSuccess: () => {
      refetch();
      setNewConsumerName("");
      setNewConsumerEmail("");
    },
  });

  const keyMutation = useMutation({
    mutationFn: (consumerId: string) => createAdminApiKey(consumerId),
    onSuccess: (result) => {
      setCreatedKey(result.rawKey);
      refetch();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ consumerId, keyId }: { consumerId: string; keyId: string }) =>
      revokeAdminApiKey(consumerId, keyId),
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: (consumerId: string) => deleteAdminConsumer(consumerId),
    onSuccess: () => refetch(),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: ({ consumerId, keyId }: { consumerId: string; keyId: string }) =>
      deleteAdminApiKey(consumerId, keyId),
    onSuccess: () => refetch(),
  });

  if (isError) {
    return <ErrorState message="Could not load API consumers." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      {/* Create new consumer */}
      <div className={PANEL_CLASS}>
        <h2 className="font-display text-sm tracking-[0.2em] text-locker-ink-muted uppercase">New Consumer</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            className={INPUT_CLASS}
            placeholder="Consumer name"
            value={newConsumerName}
            onChange={(e) => setNewConsumerName(e.target.value)}
          />
          <input
            className={INPUT_CLASS}
            placeholder="Contact email (optional)"
            value={newConsumerEmail}
            onChange={(e) => setNewConsumerEmail(e.target.value)}
          />
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={!newConsumerName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {/* One-time key display */}
      {createdKey && (
        <div className="border border-yellow-300 bg-yellow-50 p-4">
          <p className="font-mono text-[11px] text-yellow-800 uppercase tracking-[0.1em]">New API Key (copy now — shown only once)</p>
          <code className="mt-2 block break-all font-mono text-[13px] text-yellow-900">{createdKey}</code>
          <button type="button" className={`${BUTTON_CLASS} mt-2`} onClick={() => setCreatedKey(null)}>Dismiss</button>
        </div>
      )}

      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <BasketballSpinner size="lg" label="Loading consumers" />
        </div>
      ) : (
        <div className="overflow-hidden border border-landing-light bg-locker-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-landing-light bg-landing-hero">
                {["Consumer", "Rate Limit", "Daily Quota", "Usage", "Keys", ""].map((header) => (
                  <th key={header} className="px-3 py-2.5 font-mono text-[9px] font-normal tracking-[0.1em] text-locker-ink-muted uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[12.5px] text-locker-ink-muted">
                    No consumers yet.
                  </td>
                </tr>
              ) : (
                data?.data.map((consumer) => (
                  <tr key={consumer.id} className="border-b border-landing-light last:border-b-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-landing-ink">{consumer.name}</span>
                        {/* kind badge: user-provisioned consumers are warm-toned so
                            admins can tell them apart from external integrations at
                            a glance — the word and the tone both carry the category. */}
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${
                            consumer.kind === "USER"
                              ? "bg-locker-you/15 text-locker-you"
                              : "bg-landing-hero text-locker-ink-muted"
                          }`}
                        >
                          {consumer.kind === "USER" ? "User key" : "Admin key"}
                        </span>
                      </div>
                      {/* For user-owned consumers the account relation is the live
                          identity (contactEmail is just a provisioning-time copy). */}
                      <div className="text-[10px] text-locker-ink-muted">
                        {consumer.kind === "USER"
                          ? (consumer.user?.email ?? consumer.contactEmail ?? "—")
                          : (consumer.contactEmail ?? "—")}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{consumer.rateLimit}/min</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{consumer.dailyQuota}/day</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-locker-ink-muted">{consumer._count.usageLog}</td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-1">
                        {consumer.keys.map((key) => (
                          <div key={key.id} className="flex items-center gap-2 font-mono text-[10px] text-locker-ink-muted">
                            <span className={key.isActive ? "text-green-600" : "text-locker-bad"}>
                              {key.isActive ? "●" : "○"}
                            </span>
                            <span>{key.label ?? key.id.slice(0, 8)}</span>
                            {key.isActive && (
                              <button
                                type="button"
                                className={`${BUTTON_CLASS} px-1.5 py-0.5 text-[8px]`}
                                onClick={() => revokeMutation.mutate({ consumerId: consumer.id, keyId: key.id })}
                              >
                                Revoke
                              </button>
                            )}
                            <button
                              type="button"
                              className={`${BUTTON_CLASS} px-1.5 py-0.5 text-[8px] border-gray-300 text-gray-600`}
                              onClick={() => {
                                const message = key.isActive
                                  ? "Delete this key? It's still active — this will stop it working immediately."
                                  : "Delete this key permanently?";
                                if (confirm(message)) {
                                  deleteKeyMutation.mutate({ consumerId: consumer.id, keyId: key.id });
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={BUTTON_CLASS}
                          onClick={() => keyMutation.mutate(consumer.id)}
                        >
                          Generate Key
                        </button>
                        <button
                          type="button"
                          className={`${BUTTON_CLASS} border-gray-300 text-gray-600`}
                          onClick={() => {
                            if (confirm(`Delete consumer "${consumer.name}"? Their API keys will stop working immediately.`)) {
                              deleteMutation.mutate(consumer.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
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
