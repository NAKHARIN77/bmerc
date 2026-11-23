"use client";

import { countries, SITE_STATUS_LABEL, SITE_STATUSES } from "@bmerc/shared";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, ErrorState, Field, FormCard, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

const TEXT = ["country", "province", "address"] as const;

/** /sites/new and /sites/[id]/edit. */
export function SiteFormPage({ mode }: { mode: "new" | "edit" }) {
  // A fresh start on every visit by link: Next keeps visited pages alive, and an edit form must never show old values.
  const { bfcacheId } = useRouter();
  return <SiteFormLoader key={bfcacheId} mode={mode} />;
}

function SiteFormLoader({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id?: string }>();
  const { can } = useSession();
  const existing = useApi<Site>(mode === "edit" && can("company_admin") ? `/sites/${id}` : null);
  if (!can("company_admin")) return <NoAccess />;
  if (mode === "edit") {
    if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
    if (!existing.data) return <Loading />;
  }
  // Keyed on the loaded data: Next keeps this page alive between visits, so a fresh load must rebuild the form.
  return <SiteForm key={existing.data ? JSON.stringify(existing.data) : "new"} site={existing.data ?? null} />;
}

function SiteForm({ site }: { site: Site | null }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = site ? `/sites/${site.id}` : "/sites";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Record<string, string | null> = { name: String(f.get("name") ?? "").trim(), status: String(f.get("status")) };
    for (const k of TEXT) body[k] = String(f.get(k) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const saved = site ? await api<Site>(`/sites/${site.id}`, { method: "PATCH", body }) : await api<Site>("/sites", { method: "POST", body });
      // Next keeps this page alive (hidden) after navigating away, so clear it for the next visit.
      form.reset();
      setBusy(false);
      router.push(`/sites/${saved.id}`);
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  const names = countries().map((c) => c.name);
  const current = site?.country ?? "";

  return (
    <>
      <PageHeader
        title={site ? `Edit ${site.name}` : "Add site"}
        subtitle={site ? "Change the site details" : "A new branch of your repair center"}
        actions={
          <ButtonLink href={back} variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <FormCard onSubmit={submit} error={error} busy={busy} cancelHref={back} submitLabel="Save site">
        <Field label="Site name" error={fields.name}>
          {(id) => <Input id={id} name="name" defaultValue={site?.name} placeholder="e.g. Bangkok Hash Lab 01" required autoFocus />}
        </Field>
        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="Country" error={fields.country}>
            {(id) => (
              <Select id={id} name="country" defaultValue={current}>
                <option value="">Not set</option>
                {current && !names.includes(current) && <option value={current}>{current}</option>}
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="City / province" error={fields.province}>
            {(id) => <Input id={id} name="province" defaultValue={site?.province ?? ""} />}
          </Field>
        </div>
        <Field label="Address" error={fields.address} hint="Where customers ship their devices">
          {(id) => <Textarea id={id} name="address" defaultValue={site?.address ?? ""} />}
        </Field>
        <Field label="Status" error={fields.status} hint="Setup and Active count toward your plan; Inactive does not">
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
      </FormCard>
    </>
  );
}
