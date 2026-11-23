"use client";

import { useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { usd, type PlatformPlan } from "@/lib/platform";
import { Alert, Button, Card, ErrorState, Field, Input, Loading, PageHeader, Textarea } from "@/components/ui";
import { OwnerOnly } from "../owner-only";

/** Prototype "Plans": edit each plan's price and what it includes, with a preview of the pricing cards. */
export function PlansPage() {
  return (
    <OwnerOnly>
      <Plans />
    </OwnerOnly>
  );
}

function Plans() {
  const plans = useApi<PlatformPlan[]>("/platform/plans");
  if (plans.error) return <ErrorState error={plans.error} onRetry={plans.reload} />;
  if (!plans.data) return <Loading />;
  return (
    <>
      <PageHeader title="Plans" subtitle="Edit plan prices and what each plan includes. Changes show on the pricing page and in company subscriptions" />
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.data.map((p) => (
          <PlanEditor key={`${p.id}:${p.priceCents}:${p.features.join("|")}:${p.maxJobsPerMonth}:${p.maxSites}:${p.maxUsers}`} plan={p} saved={plans.reload} />
        ))}
      </div>
      <Card className="mt-4">
        <b className="text-base">Preview</b>
        <p className="text-[13px] text-muted">Shown on the pricing page, the landing page and the company subscription page. Prices exclude VAT.</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {plans.data.map((p) => (
            <div key={p.id} className="rounded-xl border border-soft bg-white p-6">
              <b className="text-lg">{p.name}</b>
              <div className="my-2 text-[28px] font-bold">{usd(p.priceCents)} / month</div>
              <ul className="list-disc pl-[18px] leading-[1.9] text-muted">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="mt-3 text-xs text-muted">Used by {p.companies} {p.companies === 1 ? "company" : "companies"}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

const asLimit = (v: string) => (v.trim() === "" || v.trim().toLowerCase() === "none" ? null : Number(v));
const showLimit = (n: number | null) => (n === null ? "" : String(n));

function PlanEditor({ plan: p, saved }: { plan: PlatformPlan; saved: () => void }) {
  const [price, setPrice] = useState((p.priceCents / 100).toString());
  const [features, setFeatures] = useState(p.features.join("\n"));
  const [jobs, setJobs] = useState(showLimit(p.maxJobsPerMonth));
  const [sites, setSites] = useState(showLimit(p.maxSites));
  const [users, setUsers] = useState(showLimit(p.maxUsers));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/platform/plans/${p.id}`, {
        method: "PATCH",
        body: {
          priceCents: Math.round(Number(price) * 100),
          features: features.split("\n").map((x) => x.trim()).filter(Boolean),
          maxJobsPerMonth: asLimit(jobs),
          maxSites: asLimit(sites),
          maxUsers: asLimit(users),
        },
      });
      setMsg({ ok: true, text: "Saved" });
      saved();
    } catch (e) {
      const f = e instanceof ApiError ? Object.values(e.fieldErrors())[0] : null;
      setMsg({ ok: false, text: f ?? errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <b className="text-lg">{p.name}</b>
        <span className="text-xs text-muted">{p.companies} {p.companies === 1 ? "company" : "companies"} on this plan</span>
      </div>
      <div className="mt-3">
        <Field label={`Price per month (${p.currency}, before VAT)`}>{(id) => <Input id={id} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <div className="grid gap-x-3 sm:grid-cols-3">
          <Field label="Job orders / month" hint="Empty = no limit">
            {(id) => <Input id={id} type="number" min={0} value={jobs} onChange={(e) => setJobs(e.target.value)} />}
          </Field>
          <Field label="Sites" hint="Empty = no limit">
            {(id) => <Input id={id} type="number" min={1} value={sites} onChange={(e) => setSites(e.target.value)} />}
          </Field>
          <Field label="Users" hint="Empty = no limit">
            {(id) => <Input id={id} type="number" min={1} value={users} onChange={(e) => setUsers(e.target.value)} />}
          </Field>
        </div>
        <Field label="What is included (one line each)">{(id) => <Textarea id={id} className="h-40" value={features} onChange={(e) => setFeatures(e.target.value)} />}</Field>
      </div>
      {msg && !msg.ok && <Alert>{msg.text}</Alert>}
      <div className="flex items-center justify-end gap-3">
        {msg?.ok && <span className="text-sm text-success">{msg.text}</span>}
        <Button busy={busy} onClick={save}>
          Save plan
        </Button>
      </div>
    </Card>
  );
}
