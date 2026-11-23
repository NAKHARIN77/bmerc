"use client";

import { countries } from "@bmerc/shared";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { CustomerDetail } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, ErrorState, Field, FormCard, Input, Loading, PageHeader, Select } from "@/components/ui";

const TEXT = ["contactName", "email", "phone", "country"] as const;

/** /customers/new and /customers/[id]/edit. */
export function CustomerFormPage({ mode }: { mode: "new" | "edit" }) {
  // A fresh start on every visit by link: Next keeps visited pages alive, and an edit form must never show old values.
  const { bfcacheId } = useRouter();
  return <CustomerFormLoader key={bfcacheId} mode={mode} />;
}

function CustomerFormLoader({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id?: string }>();
  const { can } = useSession();
  const existing = useApi<CustomerDetail>(mode === "edit" && can("company_admin") ? `/customers/${id}` : null);
  if (!can("company_admin")) return <NoAccess />;
  if (mode === "edit") {
    if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
    if (!existing.data) return <Loading />;
  }
  // Keyed on the loaded data: Next keeps this page alive between visits, so a fresh load must rebuild the form.
  return <CustomerForm key={existing.data ? JSON.stringify(existing.data) : "new"} customer={existing.data ?? null} />;
}

function CustomerForm({ customer }: { customer: CustomerDetail | null }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = customer ? `/customers/${customer.id}` : "/customers";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Record<string, string | null> = { name: String(f.get("name") ?? "").trim() };
    for (const k of TEXT) body[k] = String(f.get(k) ?? "").trim() || null; // empty clears the field
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const saved = customer
        ? await api<CustomerDetail>(`/customers/${customer.id}`, { method: "PATCH", body })
        : await api<CustomerDetail>("/customers", { method: "POST", body });
      // Next keeps this page alive (hidden) after navigating away, so clear it for the next visit.
      form.reset();
      setBusy(false);
      router.push(`/customers/${saved.id}`);
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  // Customer country is free text in the API; offer the country list but keep any older value.
  const names = countries().map((c) => c.name);
  const current = customer?.country ?? "";

  return (
    <>
      <PageHeader
        title={customer ? `Edit ${customer.name}` : "New customer"}
        subtitle={customer ? "Change the customer details" : "Add a customer company"}
        actions={
          <ButtonLink href={back} variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <FormCard onSubmit={submit} error={error} busy={busy} cancelHref={back} submitLabel="Save customer">
        <Field label="Company name" error={fields.name}>
          {(id) => <Input id={id} name="name" defaultValue={customer?.name} placeholder="e.g. BitFarm Siam" required autoFocus />}
        </Field>
        <Field label="Contact person" error={fields.contactName}>
          {(id) => <Input id={id} name="contactName" defaultValue={customer?.contactName ?? ""} placeholder="Full name" />}
        </Field>
        <Field label="Email" error={fields.email}>
          {(id) => <Input id={id} name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="name@company.com" />}
        </Field>
        <Field label="Phone" error={fields.phone}>
          {(id) => <Input id={id} name="phone" type="tel" defaultValue={customer?.phone ?? ""} />}
        </Field>
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
      </FormCard>
    </>
  );
}
