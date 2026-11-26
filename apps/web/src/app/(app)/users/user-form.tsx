"use client";

import { ROLE_LABEL, ROLES, SITE_ROLES, TEAM_ROLES, type Role } from "@bmerc/shared";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site, Team, UserRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, ErrorState, Field, FormCard, Input, Loading, PageHeader, Select } from "@/components/ui";

/** /users/new (invite) and /users/[id]/edit. Company admins only. */
export function UserFormPage({ mode }: { mode: "new" | "edit" }) {
  // A fresh start on every visit by link: Next keeps visited pages alive, and an edit form must never show old values.
  const { bfcacheId } = useRouter();
  return <UserFormLoader key={bfcacheId} mode={mode} />;
}

function UserFormLoader({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id?: string }>();
  const { me, can } = useSession();
  const isAdmin = can("company_admin");
  const user = useApi<UserRow>(mode === "edit" && isAdmin ? `/users/${id}` : null);
  const sites = useApi<Site[]>(isAdmin ? "/sites" : null);
  const teams = useApi<Team[]>(isAdmin ? "/teams" : null);
  if (!isAdmin) return <NoAccess />;
  const err = user.error ?? sites.error ?? teams.error;
  if (err) return <ErrorState error={err} />;
  if ((mode === "edit" && !user.data) || !sites.data || !teams.data) return <Loading />;
  // Keyed on the loaded data: Next keeps this page alive between visits, so a fresh load must rebuild the form.
  return <UserForm key={user.data ? JSON.stringify(user.data) : "new"} user={user.data ?? null} isSelf={user.data?.id === me.id} sites={sites.data} teams={teams.data} />;
}

function UserForm({ user, isSelf, sites, teams }: { user: UserRow | null; isSelf: boolean; sites: Site[]; teams: Team[] }) {
  const router = useRouter();
  // Opened from a site page (?siteId=): start with that site and its first team.
  const presetSite = useSearchParams().get("siteId");
  const fromSite = !user && presetSite && sites.some((s) => s.id === presetSite) ? presetSite : null;
  const [role, setRole] = useState<Role>(user?.role ?? "technician");
  const [siteIds, setSiteIds] = useState<string[]>(user?.siteIds ?? (fromSite ? [fromSite] : []));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
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
      let mailFailed = false;
      if (user) await api(`/users/${user.id}`, { method: "PATCH", body });
      else mailFailed = (await api<{ emailSent?: boolean }>("/users", { method: "POST", body })).emailSent === false;
      // Next keeps this page alive (hidden) after navigating away, so clear it for the next visit.
      form.reset();
      setBusy(false);
      if (!user) {
        setRole("technician");
        setSiteIds([]);
      }
      router.push(mailFailed ? "/users?mail=failed" : "/users");
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  const bySite = sites.map((s) => ({ site: s, teams: teams.filter((t) => t.siteId === s.id) })).filter((g) => g.teams.length);

  return (
    <>
      <PageHeader
        title={user ? `Edit ${user.fullName}` : "New user"}
        subtitle={user ? user.email : "Add a person to your company. They get an email link to set their password"}
        actions={
          <ButtonLink href={fromSite ? `/sites/${fromSite}` : "/users"} variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <FormCard onSubmit={submit} error={error} busy={busy} cancelHref={fromSite ? `/sites/${fromSite}` : "/users"} submitLabel={user ? "Save user" : "Send invite"}>
        <Field label="Full name" error={fields.fullName}>
          {(id) => <Input id={id} name="fullName" defaultValue={user?.fullName} placeholder="e.g. Somchai J." required autoFocus />}
        </Field>
        {!user && (
          <Field label="Email" error={fields.email} hint="The invite link is sent here and works for 7 days">
            {(id) => <Input id={id} name="email" type="email" placeholder="tech@company.com" required />}
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
            <legend className="mb-1.5 text-xs font-medium text-muted">{role === "stock_keeper" ? "Sites (stock keeper)" : "Sites managed (site manager)"}</legend>
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
                  : "A site manager sees only the sites picked here and can manage more than one. The company admin sees every site.")}
            </p>
          </fieldset>
        ) : TEAM_ROLES.includes(role) && (bySite.length === 0 || (fromSite && !teams.some((t) => t.siteId === fromSite))) ? (
          <div className="mb-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-ink">
            <b>No teams yet.</b> A technician or head technician must belong to a team, and each team works at one site.{" "}
            {sites.length === 0 ? "Add a site first, then a team." : fromSite ? "This site has no team yet. Add one, then invite them." : "Add a team first, then invite them."}
            <div className="mt-2">
              <ButtonLink href={sites.length === 0 ? "/sites/new" : fromSite ? `/teams/new?siteId=${fromSite}` : "/teams/new"} variant="secondary">
                {sites.length === 0 ? "+ Add site" : "+ Add team"}
              </ButtonLink>
            </div>
          </div>
        ) : TEAM_ROLES.includes(role) ? (
          <Field label="Team" error={fields.teamId} hint="Technicians see the jobs of their team's site">
            {(id) => (
              <Select id={id} name="teamId" defaultValue={user?.teamId ?? (fromSite ? (teams.find((t) => t.siteId === fromSite)?.id ?? "") : "")}>
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
      </FormCard>
    </>
  );
}
