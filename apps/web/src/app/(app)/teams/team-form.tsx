"use client";

import { ROLE_LABEL, TEAM_ROLES } from "@bmerc/shared";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site, Team, UserRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, ErrorState, Field, FormCard, Input, Loading, PageHeader, Select } from "@/components/ui";

/** /teams/new and /teams/[id]/edit (company admins and site managers). */
export function TeamFormPage({ mode }: { mode: "new" | "edit" }) {
  // A fresh start on every visit by link: Next keeps visited pages alive, and an edit form must never show old values.
  const { bfcacheId } = useRouter();
  return <TeamFormLoader key={bfcacheId} mode={mode} />;
}

function TeamFormLoader({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id?: string }>();
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager");
  const teams = useApi<Team[]>(allowed ? "/teams" : null);
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  const users = useApi<UserRow[]>(allowed ? "/users" : null);

  if (!allowed) return <NoAccess />;
  const err = teams.error ?? sites.error ?? users.error;
  if (err) return <ErrorState error={err} onRetry={() => (teams.reload(), sites.reload(), users.reload())} />;
  if (!teams.data || !sites.data || !users.data) return <Loading />;
  const team = mode === "edit" ? teams.data.find((t) => t.id === id) : null;
  if (mode === "edit" && !team) return <ErrorState error={new Error("Team not found")} />;
  // Keyed on the loaded data: Next keeps this page alive between visits, so a fresh load must rebuild the form.
  return <TeamForm key={team ? JSON.stringify(team) : "new"} team={team ?? null} sites={sites.data} teams={teams.data} users={users.data} canMoveSite={can("company_admin")} />;
}

function TeamForm({ team, sites, teams, users, canMoveSite }: { team: Team | null; sites: Site[]; teams: Team[]; users: UserRow[]; canMoveSite: boolean }) {
  const router = useRouter();
  const presetSite = useSearchParams().get("siteId") ?? undefined;
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
    const form = e.currentTarget;
    const f = new FormData(form);
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
      // Next keeps this page alive (hidden) after navigating away, so clear it for the next visit.
      form.reset();
      setBusy(false);
      if (!team) {
        setMemberIds([]);
        setHeadId("");
        setCreatedId(null);
      }
      router.push("/teams");
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!team || !window.confirm(`Delete ${team.name}?`)) return;
    setError(null);
    try {
      await api(`/teams/${team.id}`, { method: "DELETE" });
      router.push("/teams");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title={team ? `Edit ${team.name}` : "New team"}
        subtitle={team ? `${team.site.name} · members and head technician` : "A team belongs to one site and sees that site's jobs"}
        actions={
          <>
            {team && (
              <Button variant="danger" onClick={remove}>
                Delete team
              </Button>
            )}
            <ButtonLink href="/teams" variant="secondary">
              Cancel
            </ButtonLink>
          </>
        }
      />
      {error && team && <Alert>{error}</Alert>}
      <FormCard onSubmit={submit} error={team ? null : error} busy={busy} cancelHref="/teams" submitLabel="Save team">
        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="Team name" error={fields.name}>
            {(id) => <Input id={id} name="name" defaultValue={team?.name} placeholder="e.g. Team Alpha" required autoFocus />}
          </Field>
          <Field label="Site" error={fields.siteId} hint={team && !canMoveSite ? "Only a company admin can move a team to another site" : undefined}>
            {(id) => (
              <Select id={id} name="siteId" defaultValue={team?.siteId ?? (sites.some((x) => x.id === presetSite) ? presetSite : sites[0]?.id)} disabled={!!team && !canMoveSite}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {team && !canMoveSite && <input type="hidden" name="siteId" value={team.siteId} />}

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-muted">Members</legend>
          <div className="max-h-72 overflow-y-auto rounded-lg bg-field p-3">
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
      </FormCard>
    </>
  );
}
