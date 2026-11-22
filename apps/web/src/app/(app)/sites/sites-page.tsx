"use client";

import { SITE_STATUS_LABEL, SITE_STATUSES, type SiteStatus } from "@bmerc/shared";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { SiteStatusChip } from "@/components/chips";
import { Alert, Button, Drawer, ErrorState, Field, Input, Loading, PageHeader, Select, Table, Textarea } from "@/components/ui";

type Editing = { site: Site | null } | null;

export function SitesPage() {
  const { me, can } = useSession();
  const isAdmin = can("company_admin");
  const sites = useApi<Site[]>(me.role ? "/sites" : null);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!me.role) return <NoAccess />;

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle={isAdmin ? "Branches of your repair center. Each site has its own teams and stock" : "The sites you work at"}
        actions={isAdmin && <Button onClick={() => setEditing({ site: null })}>+ Add site</Button>}
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {sites.error ? (
        <ErrorState error={sites.error} onRetry={sites.reload} />
      ) : !sites.data ? (
        <Loading />
      ) : (
        <Table
          rows={sites.data}
          rowKey={(s) => s.id}
          onRowClick={isAdmin ? (s) => setEditing({ site: s }) : undefined}
          empty={isAdmin ? "No sites yet. Add your first branch" : "You are not linked to a site yet. Ask your company admin"}
          columns={[
            { header: "Site", cell: (s) => <span className="font-semibold text-navy">{s.name}</span> },
            { header: "Location", cell: (s) => [s.province, s.country].filter(Boolean).join(", ") || "—" },
            { header: "Teams", cell: (s) => s.teams.map((t) => t.name).join(", ") || <span className="text-muted">No teams</span> },
            { header: "Status", cell: (s) => <SiteStatusChip status={s.status} /> },
          ]}
        />
      )}
      {isAdmin && <p className="mt-3 text-xs text-muted">Sites cannot be deleted because they hold stock and job history. Set a site to Inactive instead; inactive sites do not count toward your plan.</p>}

      <Drawer open={editing !== null} title={editing?.site ? `Edit ${editing.site.name}` : "Add site"} onClose={() => setEditing(null)}>
        {editing && (
          <SiteForm
            key={editing.site?.id ?? "new"}
            site={editing.site}
            onDone={(text) => {
              setEditing(null);
              setNotice(text);
              sites.reload();
            }}
          />
        )}
      </Drawer>
    </>
  );
}

const TEXT = ["country", "province", "address"] as const;

function SiteForm({ site, onDone }: { site: Site | null; onDone: (msg: string) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, string | null> = { name: String(f.get("name") ?? "").trim(), status: String(f.get("status")) as SiteStatus };
    for (const k of TEXT) body[k] = String(f.get(k) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (site) await api(`/sites/${site.id}`, { method: "PATCH", body });
      else await api("/sites", { method: "POST", body });
      onDone(site ? `Saved ${body.name}` : `Added ${body.name}`);
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
      <Field label="Site name" error={fields.name}>
        {(id) => <Input id={id} name="name" defaultValue={site?.name} placeholder="e.g. Bangkok Hash Lab 01" required autoFocus />}
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Country" error={fields.country}>
          {(id) => <Input id={id} name="country" defaultValue={site?.country ?? ""} />}
        </Field>
        <Field label="Province / state" error={fields.province}>
          {(id) => <Input id={id} name="province" defaultValue={site?.province ?? ""} />}
        </Field>
      </div>
      <Field label="Address" error={fields.address} hint="Where customers ship their devices">
        {(id) => <Textarea id={id} name="address" defaultValue={site?.address ?? ""} />}
      </Field>
      <Field label="Status" error={fields.status} hint="Setting up and Active count toward your plan; Inactive does not">
        {(id) => (
          <Select id={id} name="status" defaultValue={site?.status ?? "setup"}>
            {SITE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SITE_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" busy={busy} className="mt-2 w-full">
        {site ? "Save changes" : "Add site"}
      </Button>
    </form>
  );
}
