"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { PlatformCompanyDetail } from "@/lib/platform";
import { Alert, Button, ButtonLink, Card, ErrorState, Field, Input, Loading, PageHeader, Textarea } from "@/components/ui";
import { OwnerOnly } from "../../owner-only";

type Key = "maxJobsPerMonth" | "maxSites" | "maxUsers";
const show = (n: number | null | undefined) => (n === null || n === undefined ? "No limit" : String(n));

/** Prototype "Edit limits": the plan's limits, and an override for agreed exceptions (a reason is required). */
export function LimitsPage() {
  return (
    <OwnerOnly>
      <Limits />
    </OwnerOnly>
  );
}

function Limits() {
  const { id } = useParams<{ id: string }>();
  const c = useApi<PlatformCompanyDetail>(`/platform/companies/${id}`);
  if (c.error) return <ErrorState error={c.error} onRetry={c.reload} />;
  if (!c.data) return <Loading />;
  return <LimitsForm key={JSON.stringify(c.data.subscription?.overrideLimits ?? null)} c={c.data} />;
}

function LimitsForm({ c }: { c: PlatformCompanyDetail }) {
  const router = useRouter();
  const plan = c.subscription?.plan;
  const o = c.subscription?.overrideLimits ?? null;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Empty = follow the plan; a number sets the limit; "none" = no limit.
  const initial = (k: Key) => (o && k in o ? (o[k] === null ? "none" : String(o[k])) : "");

  async function send(body: Record<string, unknown>) {
    setBusy(body.reset ? "reset" : "save");
    setError(null);
    setFields({});
    try {
      await api(`/platform/companies/${c.id}/limits`, { method: "PATCH", body });
      router.push("/platform/quotas");
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(null);
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { reason: String(f.get("reason") ?? "").trim() };
    for (const k of ["maxJobsPerMonth", "maxSites", "maxUsers"] as const) {
      const v = String(f.get(k) ?? "").trim().toLowerCase();
      if (v !== "") body[k] = v === "none" ? null : Number(v);
    }
    void send(body);
  }

  return (
    <>
      <PageHeader
        title={`Plan and limits: ${c.name}`}
        subtitle="The plan comes from the company purchase or sign-up. Limits follow the plan automatically."
        actions={
          <ButtonLink href="/platform/quotas" variant="secondary">
            Back to quotas
          </ButtonLink>
        }
      />
      <Card className="max-w-[720px]">
        {error && <Alert>{error}</Alert>}
        <Field label="Company">{(fid) => <Input id={fid} value={c.name} disabled />}</Field>
        <Field label="Plan (linked to company)">{(fid) => <Input id={fid} value={plan?.name ?? "—"} disabled />}</Field>
        <Field label="Credits per month">{(fid) => <Input id={fid} value={show(plan?.maxJobsPerMonth)} disabled />}</Field>
        <Field label="Sites">{(fid) => <Input id={fid} value={show(plan?.maxSites)} disabled />}</Field>
        <Field label="Users">{(fid) => <Input id={fid} value={show(plan?.maxUsers)} disabled />}</Field>
        <form onSubmit={save} noValidate className="mt-5 border-t border-soft pt-4">
          <b className="text-base">Override (special cases only)</b>
          <p className="mb-4 mt-1 text-[13px] text-muted">
            Use only when the customer has an agreed exception. Leave a box empty to follow the plan, or type <b>none</b> for no limit. A reason is required.
          </p>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="Credits per month" error={fields.maxJobsPerMonth}>
              {(fid) => <Input id={fid} name="maxJobsPerMonth" defaultValue={initial("maxJobsPerMonth")} placeholder="e.g. 220" />}
            </Field>
            <Field label="Sites" error={fields.maxSites}>
              {(fid) => <Input id={fid} name="maxSites" defaultValue={initial("maxSites")} placeholder="Plan" />}
            </Field>
            <Field label="Users" error={fields.maxUsers}>
              {(fid) => <Input id={fid} name="maxUsers" defaultValue={initial("maxUsers")} placeholder="Plan" />}
            </Field>
          </div>
          <Field label="Reason" error={fields.reason}>
            {(fid) => <Textarea id={fid} name="reason" placeholder="Why this override is needed" required />}
          </Field>
          <div className="flex flex-wrap justify-end gap-2.5">
            {o && (
              <Button type="button" variant="secondary" busy={busy === "reset"} onClick={() => void send({ reset: true, reason: "Back to plan limits" })}>
                Remove override
              </Button>
            )}
            <ButtonLink href="/platform/quotas" variant="secondary">
              Cancel
            </ButtonLink>
            <Button type="submit" busy={busy === "save"}>
              Save override
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
