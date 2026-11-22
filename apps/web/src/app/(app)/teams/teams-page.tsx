"use client";

import { ROLE_LABEL, TEAM_ROLES } from "@bmerc/shared";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site, Team, UserRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, Card, Drawer, ErrorState, Field, Input, Loading, PageHeader, Select } from "@/components/ui";

type Editing = { team: Team | null } | null;

export function TeamsPage() {
  const { me, can } = useSession();
  const canManage = can("company_admin", "site_manager");
  const teams = useApi<Team[]>(me.role ? "/teams" : null);
  const sites = useApi<Site[]>(me.role ? "/sites" : null);
  const users = useApi<UserRow[]>(canManage ? "/users" : null);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  if (!me.role) return <NoAccess />;

  const err = teams.error ?? sites.error;
  const groups = (sites.data ?? []).map((s) => ({ site: s, teams: (teams.data ?? []).filter((t) => t.siteId === s.id) }));

  async function remove(t: Team) {
    if (!window.confirm(`Delete ${t.name}?`)) return;
    setNotice(null);
    try {
      await api(`/teams/${t.id}`, { method: "DELETE" });
      setNotice({ tone: "success", text: `${t.name} was deleted` });
      teams.reload();
    } catch (e) {
      setNotice({ tone: "danger", text: errorMessage(e) });
    }
  }

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Technicians work in teams. A team belongs to one site and sees that site's jobs"
        actions={canManage && (sites.data?.length ?? 0) > 0 && <Button onClick={() => setEditing({ team: null })}>+ Add team</Button>}
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {err ? (
        <ErrorState error={err} onRetry={() => (teams.reload(), sites.reload())} />
      ) : !teams.data || !sites.data ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Card className="text-center text-muted">No sites yet. Add a site before adding teams.</Card>
      ) : (
        groups.map(({ site, teams: list }) => (
          <section key={site.id} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted">{site.name}</h2>
            {list.length === 0 ? (
              <Card className="text-sm text-muted">No teams at this site yet.</Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => {
                  const head = t.members.find((m) => m.id === t.headUserId);
                  return (
                    <Card key={t.id}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-navy">{t.name}</h3>
                          <p className="text-xs text-muted">Head: {head?.fullName ?? "not set"}</p>
                        </div>
                        <span className="text-xs text-muted">{t.members.length === 1 ? "1 person" : `${t.members.length} people`}</span>
                      </div>
                      {t.members.length === 0 ? (
                        <p className="text-sm text-muted">No members yet.</p>
                      ) : (
                        <ul className="text-sm">
                          {t.members.map((m) => (
                            <li key={m.id} className="flex justify-between border-t border-soft py-1.5">
                              <span className={m.isActive ? "text-ink" : "text-muted line-through"}>{m.fullName}</span>
                              <span className="text-xs text-muted">{m.role ? ROLE_LABEL[m.role] : ""}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {canManage && (
                        <div className="mt-3 flex gap-2">
                          <Button variant="secondary" className="h-8" onClick={() => setEditing({ team: t })}>
                            Edit
                          </Button>
                          <Button variant="danger" className="h-8" onClick={() => remove(t)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}

      <Drawer open={editing !== null} title={editing?.team ? `Edit ${editing.team.name}` : "Add team"} onClose={() => setEditing(null)}>
        {editing && (
          <TeamForm
            key={editing.team?.id ?? "new"}
            team={editing.team}
            sites={sites.data ?? []}
            teams={teams.data ?? []}
            users={users.data ?? []}
            canMoveSite={can("company_admin")}
            onDone={(text) => {
              setEditing(null);
              setNotice({ tone: "success", text });
              teams.reload();
              users.reload();
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function TeamForm({ team, sites, teams, users, canMoveSite, onDone }: {
  team: Team | null;
  sites: Site[];
  teams: Team[];
  users: UserRow[];
  canMoveSite: boolean;
  onDone: (msg: string) => void;
}) {
  const [memberIds, setMemberIds] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const [headId, setHeadId] = useState(team?.headUserId ?? "");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  // Technicians and head technicians only; people in other teams are listed last and move over if ticked.
  const candidates = users
    .filter((u) => u.isActive && u.role && TEAM_ROLES.includes(u.role))
    .sort((a, b) => Number(!!a.teamId && a.teamId !== team?.id) - Number(!!b.teamId && b.teamId !== team?.id) || a.fullName.localeCompare(b.fullName));
  const heads = candidates.filter((u) => memberIds.includes(u.id) && u.role === "head_technician");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const siteId = String(f.get("siteId") ?? "");
    setBusy(true);
    setError(null);
    setFields({});
    try {
      // A new team is created once; if a later step fails, trying again updates that team instead of adding another.
      let id = team?.id ?? createdId;
      if (team) {
        await api(`/teams/${team.id}`, { method: "PATCH", body: { name, ...(siteId !== team.siteId ? { siteId } : {}) } });
      } else if (id) {
        await api(`/teams/${id}`, { method: "PATCH", body: { name, siteId } });
      } else {
        id = (await api<Team>("/teams", { method: "POST", body: { name, siteId } })).id;
        setCreatedId(id);
      }
      // Members first, then the head: the head must already be in the team.
      await api(`/teams/${id}/members`, { method: "PUT", body: { userIds: memberIds } });
      const head = memberIds.includes(headId) ? headId : null;
      if (head !== (team?.headUserId ?? null)) await api(`/teams/${id}`, { method: "PATCH", body: { headUserId: head } });
      onDone(team ? `Saved ${name}` : `Added ${name}`);
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Team name" error={fields.name}>
        {(id) => <Input id={id} name="name" defaultValue={team?.name} placeholder="e.g. Team Alpha" required autoFocus />}
      </Field>
      <Field label="Site" error={fields.siteId} hint={team && !canMoveSite ? "Only a company admin can move a team to another site" : undefined}>
        {(id) => (
          <Select id={id} name="siteId" defaultValue={team?.siteId ?? sites[0]?.id} disabled={!!team && !canMoveSite}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {team && !canMoveSite && <input type="hidden" name="siteId" value={team.siteId} />}

      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-medium text-muted">Members</legend>
        <div className="max-h-64 overflow-y-auto rounded-lg bg-field p-3">
          {candidates.length === 0 && <p className="text-sm text-muted">No technicians yet. Invite them from Users.</p>}
          {candidates.map((u) => {
            const elsewhere = u.teamId && u.teamId !== team?.id ? teamName.get(u.teamId) : null;
            return (
              <label key={u.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={memberIds.includes(u.id)}
                  onChange={(e) => setMemberIds((cur) => (e.target.checked ? [...cur, u.id] : cur.filter((x) => x !== u.id)))}
                />
                <span className="flex-1">{u.fullName}</span>
                <span className="text-xs text-muted">
                  {u.role ? ROLE_LABEL[u.role] : ""}
                  {elsewhere ? ` · now in ${elsewhere}` : ""}
                </span>
              </label>
            );
          })}
        </div>
        <p className={`mt-1 text-xs ${fields.userIds ? "text-danger" : "text-neutral"}`}>
          {fields.userIds ?? "Ticking someone from another team moves them here. Members see the jobs of this team's site."}
        </p>
      </fieldset>

      <Field label="Head technician" error={fields.headUserId} hint="Pick from the members who are head technicians">
        {(id) => (
          <Select id={id} value={heads.some((h) => h.id === headId) ? headId : ""} onChange={(e) => setHeadId(e.target.value)}>
            <option value="">No head</option>
            {heads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.fullName}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button type="submit" busy={busy} className="mt-2 w-full">
        {team ? "Save changes" : "Add team"}
      </Button>
    </form>
  );
}
