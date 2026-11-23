"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { PlatformCompany } from "@/lib/platform";
import { Alert, Button, ButtonLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pills } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { AccessChip, PaymentChip } from "../owner-chips";

/** Prototype "Quotas": plan, limits, usage, payment and access per company. A suspended company cannot use the system. */
export function QuotasPage() {
  return (
    <OwnerOnly>
      <Quotas />
    </OwnerOnly>
  );
}

type Filter = "all" | "near" | "suspended" | "overdue";
const pct = (used: number, limit: number | null) => (limit === null ? null : limit === 0 ? 100 : Math.round((used / limit) * 100));
/** Highest share of any limit in use: 80% and up is "near the limit". */
const peak = (c: PlatformCompany) =>
  Math.max(0, ...[pct(c.usage.jobsThisMonth, c.limits.jobsPerMonth), pct(c.usage.sites, c.limits.sites), pct(c.usage.users, c.limits.users)].filter((x): x is number => x !== null));

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const p = pct(used, limit);
  const tone = p === null ? "bg-[#cfd8ea]" : p >= 100 ? "bg-danger" : p >= 80 ? "bg-warn" : "bg-info";
  return (
    <div className="min-w-[110px] flex-1">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="whitespace-nowrap text-muted">{label}</span>
        <span className={`whitespace-nowrap font-semibold ${p !== null && p >= 100 ? "text-danger" : "text-ink"}`}>
          {used}
          <span className="font-normal text-muted"> / {limit === null ? "∞" : limit}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${p === null ? 100 : Math.min(100, Math.max(p, used ? 4 : 0))}%`, opacity: p === null ? 0.6 : 1 }} />
      </div>
    </div>
  );
}

function Quotas() {
  const list = useApi<PlatformCompany[]>("/platform/companies");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(c: PlatformCompany) {
    const suspend = c.status === "active";
    if (suspend && !window.confirm(`Suspend ${c.name}? Their staff will only see the Account suspended page until you activate them again. No data is deleted.`)) return;
    setBusy(c.id);
    setError(null);
    try {
      await api(`/platform/companies/${c.id}/${suspend ? "suspend" : "activate"}`, { method: "POST", body: {} });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const all = list.data;
  const is = {
    near: (c: PlatformCompany) => peak(c) >= 80,
    suspended: (c: PlatformCompany) => c.status !== "active",
    overdue: (c: PlatformCompany) => c.payment === "Overdue",
  };
  const shown = filter === "all" ? all : all.filter(is[filter]);
  const n = (k: keyof typeof is) => all.filter(is[k]).length;

  return (
    <>
      <PageHeader title="Quotas" subtitle="Plan, limits and access for each company. A suspended company cannot use the system" />
      <KpiRow>
        <Kpi label="Near the limit" value={n("near")} caption="80% or more of a limit used" tone="warn" icon="shield" />
        <Kpi label="Overdue" value={n("overdue")} caption="Plan invoice past due" tone="danger" icon="doc" />
        <Kpi label="Suspended" value={n("suspended")} caption="Cannot use the system" tone="neutral" icon="shield" />
      </KpiRow>
      <Pills
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `All (${all.length})` },
          { value: "near", label: `Near the limit (${n("near")})` },
          { value: "overdue", label: `Overdue (${n("overdue")})` },
          { value: "suspended", label: `Suspended (${n("suspended")})` },
        ]}
      />
      {error && <Alert>{error}</Alert>}
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.05)]">
        {shown.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">No companies in this group.</div>
        ) : (
          <ul className="divide-y divide-soft">
            {shown.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
                <div className="w-full min-w-0 sm:w-[200px]">
                  <Link href={`/platform/companies/${c.id}`} className="text-[15px] font-semibold text-info hover:underline">
                    {c.name}
                  </Link>
                  <div className="mt-1 text-[13px] text-muted">
                    {c.plan ? `${c.plan.name} plan` : "No plan"}
                    {c.hasOverride && <span className="ml-1.5 rounded bg-[#eef1f8] px-1.5 py-0.5 text-[11px] font-semibold text-navy">Custom limits</span>}
                  </div>
                </div>
                <div className="flex min-w-[260px] flex-[2] flex-wrap gap-x-5 gap-y-2">
                  <Meter label="Jobs this month" used={c.usage.jobsThisMonth} limit={c.limits.jobsPerMonth} />
                  <Meter label="Sites" used={c.usage.sites} limit={c.limits.sites} />
                  <Meter label="Users" used={c.usage.users} limit={c.limits.users} />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <PaymentChip payment={c.payment} />
                  <AccessChip status={c.status} />
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  <ButtonLink href={`/platform/quotas/${c.id}`} variant="secondary" className="h-9">
                    Change limits
                  </ButtonLink>
                  {c.status !== "closed" && (
                    <Button className="h-9" variant={c.status === "active" ? "secondary" : "primary"} busy={busy === c.id} onClick={() => toggle(c)}>
                      {c.status === "active" ? "Suspend" : "Activate"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">∞ means no limit. Bars turn amber at 80% and red at the limit; a company at its job-order limit cannot receive new devices.</p>
    </>
  );
}
