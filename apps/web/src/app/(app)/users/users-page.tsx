"use client";

import { ROLE_LABEL, ROLES, SITE_ROLES, TEAM_ROLES, type Role } from "@bmerc/shared";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site, Team, UserRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, Chip, Drawer, ErrorState, Field, Input, Loading, PageHeader, Select, Table } from "@/components/ui";


type Editing = { mode: "invite" } | { mode: "edit"; user: UserRow } | null;

export function UsersPage() {
  const { me, can } = useSession();
  const isAdmin = can("company_admin");
  const users = useApi<UserRow[]>(can("company_admin", "site_manager") ? "/users" : null);
  const sites = useApi<Site[]>("/sites");
  const teams = useApi<Team[]>("/teams");
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const siteName = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s.name])), [sites.data]);

  if (!can("company_admin", "site_manager")) return <NoAccess />;

  async function act(label: string, run: () => Promise<unknown>) {
    setNotice(null);
    try {
      await run();
      setNotice({ tone: "success", text: label });
      users.reload();
    } catch (e) {
      setNotice({ tone: "danger", text: errorMessage(e) });
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={isAdmin ? "Everyone in your company. New people get an email invite and set their own password" : "Staff in teams at your sites"}
        actions={isAdmin && <Button onClick={() => setEditing({ mode: "invite" })}>+ Invite user</Button>}
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {users.error ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : !users.data ? (
        <Loading />
      ) : (
        <Table
          rows={users.data}
          rowKey={(u) => u.id}
          columns={[
            {
              header: "Name",
              cell: (u) => (
                <div>
                  <div className="font-semibold text-navy">
                    {u.fullName}
                    {u.id === me.id && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}
                  </div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
              ),
            },
            { header: "Role", cell: (u) => (u.role ? ROLE_LABEL[u.role] : "—") },
            {
              header: "Team / sites",
              cell: (u) =>
                u.role && SITE_ROLES.includes(u.role)
                  ? u.siteIds.map((id) => siteName.get(id) ?? "Unknown site").join(", ") || "—"
                  : u.team
                    ? `${u.team.name} · ${siteName.get(u.team.siteId) ?? ""}`
                    : "—",
            },
            {
              header: "Status",
              cell: (u) => (!u.isActive ? <Chip>Inactive</Chip> : u.status === "invited" ? <Chip tone="warn">Invited</Chip> : <Chip tone="success">Active</Chip>),
            },
            { header: "Last login", cell: (u) => fmtDateTime(u.lastLoginAt) },
            ...(isAdmin
              ? [
                  {
                    header: "",
                    className: "text-right whitespace-nowrap",
                    cell: (u: UserRow) => (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" className="h-8" onClick={() => setEditing({ mode: "edit", user: u })}>
                          Edit
                        </Button>
                        {u.status === "invited" && u.isActive && (
                          <Button variant="secondary" className="h-8" onClick={() => act(`Invite sent again to ${u.email}`, () => api(`/users/${u.id}/resend-invite`, { method: "POST" }))}>
                            Resend invite
                          </Button>
                        )}
                        {u.id !== me.id &&
                          (u.isActive ? (
                            <Button variant="danger" className="h-8" onClick={() => act(`${u.fullName} was deactivated and signed out`, () => api(`/users/${u.id}/deactivate`, { method: "POST" }))}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="secondary" className="h-8" onClick={() => act(`${u.fullName} can log in again`, () => api(`/users/${u.id}/activate`, { method: "POST" }))}>
                              Activate
                            </Button>
                          ))}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      <Drawer open={editing !== null} title={editing?.mode === "edit" ? `Edit ${editing.user.fullName}` : "Invite user"} onClose={() => setEditing(null)}>
        {editing && (
          <UserForm
            key={editing.mode === "edit" ? editing.user.id : "new"}
            user={editing.mode === "edit" ? editing.user : null}
            isSelf={editing.mode === "edit" && editing.user.id === me.id}
            sites={sites.data ?? []}
            teams={teams.data ?? []}
            onDone={(text) => {
              setEditing(null);
              setNotice({ tone: "success", text });
              users.reload();
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function UserForm({ user, isSelf, sites, teams, onDone }: { user: UserRow | null; isSelf: boolean; sites: Site[]; teams: Team[]; onDone: (msg: string) => void }) {
  const [role, setRole] = useState<Role>(user?.role ?? "technician");
  const [siteIds, setSiteIds] = useState<string[]>(user?.siteIds ?? []);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const teamId = (f.get("teamId") as string) || null;
    const body = {
      fullName: f.get("fullName"),
      role,
      teamId: TEAM_ROLES.includes(role) ? teamId : null,
      siteIds: SITE_ROLES.includes(role) ? siteIds : [],
      ...(user ? {} : { email: f.get("email") }),
    };
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (user) {
        await api(`/users/${user.id}`, { method: "PATCH", body });
        onDone(`Saved changes to ${body.fullName}`);
      } else {
        await api("/users", { method: "POST", body });
        onDone(`Invite sent to ${body.email}. The link works for 7 days`);
      }
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  const bySite = sites.map((s) => ({ site: s, teams: teams.filter((t) => t.siteId === s.id) })).filter((g) => g.teams.length);

  return (
    <form onSubmit={submit} noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Full name" error={fields.fullName}>
        {(id) => <Input id={id} name="fullName" defaultValue={user?.fullName} required autoFocus />}
      </Field>
      {!user && (
        <Field label="Work email" error={fields.email} hint="The invite link is sent here">
          {(id) => <Input id={id} name="email" type="email" required />}
        </Field>
      )}
      <Field label="Role" error={fields.role} hint={isSelf ? "You cannot change your own role" : undefined}>
        {(id) => (
          <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {SITE_ROLES.includes(role) ? (
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-muted">Sites managed</legend>
          <div className="rounded-lg bg-field p-3">
            {sites.length === 0 && <p className="text-sm text-muted">Add a site first.</p>}
            {sites.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={siteIds.includes(s.id)}
                  onChange={(e) => setSiteIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                />
                {s.name}
              </label>
            ))}
          </div>
          <p className={`mt-1 text-xs ${fields.siteIds ? "text-danger" : "text-neutral"}`}>
            {fields.siteIds ??
              (role === "stock_keeper"
                ? "Stock and jobs of these sites only. Pick one or more."
                : "A site manager sees only these sites. Pick one or more.")}
          </p>
        </fieldset>
      ) : TEAM_ROLES.includes(role) ? (
        <Field label="Team" error={fields.teamId} hint="Technicians see the jobs of their team's site">
          {(id) => (
            <Select id={id} name="teamId" defaultValue={user?.teamId ?? ""}>
              <option value="">Choose a team…</option>
              {bySite.map((g) => (
                <optgroup key={g.site.id} label={g.site.name}>
                  {g.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <p className="mb-4 text-xs text-muted">Company admins see every site and are not in a team.</p>
      )}

      <Button type="submit" busy={busy} className="mt-2 w-full">
        {user ? "Save changes" : "Send invite"}
      </Button>
    </form>
  );
}
