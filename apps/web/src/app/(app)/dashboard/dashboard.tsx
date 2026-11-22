"use client";

import { JOB_STATUS_LABEL, type JobStatus } from "@bmerc/shared";
import Link from "next/link";
import { useState } from "react";
import { fmtLimit } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { JobRow, JobSummary, Page, PartRow, Usage } from "@/lib/types";
import { StatusChip } from "@/components/chips";
import { Card, ErrorState, Kpi, Loading, PageHeader, Pills, SearchBar, SectionTitle } from "@/components/ui";

type Filter = "all" | JobStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  ...(["todo", "in_repair", "waiting_parts", "unrepairable", "qc_passed"] as const).map((s) => ({ value: s, label: JOB_STATUS_LABEL[s] })),
];

export function Dashboard() {
  const { me, can } = useSession();

  if (me.isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Platform overview" subtitle="Companies, plans and payments" />
        <Card>The platform owner console (companies, quotas, revenue) comes with the billing work in plan step 7.</Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" subtitle="Your repair center at a glance" />
      <Counts />
      <div className={`mb-5 grid gap-4 ${can("company_admin") ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <NeedsAttention />
        {can("company_admin") && <PlanCard />}
      </div>
      <JobCards />
    </>
  );
}

function Counts() {
  const summary = useApi<JobSummary>("/jobs/summary");
  const parts = useApi<Page<PartRow>>("/parts?limit=100");
  const s = summary.data;
  const low = parts.data?.items.filter((p) => p.belowMin).length;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  return (
    <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Kpi label="Open jobs" value={s?.open ?? "—"} caption="Not yet passed QC" tone="info" icon="wrench" />
      <Kpi label="In repair" value={s?.byStatus.in_repair ?? "—"} caption="Being repaired now" icon="wrench" />
      <Kpi label="Waiting parts" value={s?.byStatus.waiting_parts ?? "—"} caption="Waiting for spare parts" tone="warn" icon="box" />
      <Kpi label="Low stock" value={low ?? "—"} caption="Below minimum level, by site" tone="danger" icon="box" />
    </div>
  );
}

/** Open jobs that need someone: urgent or high priority, waiting for parts, or cannot be repaired. */
function NeedsAttention() {
  const jobs = useApi<Page<JobRow>>("/jobs?open=true&limit=100");
  const reason = (j: JobRow) =>
    j.status === "unrepairable"
      ? "Cannot repair"
      : j.priority === "urgent"
        ? "URGENT"
        : j.priority === "high"
          ? "HIGH PRIORITY"
          : j.status === "waiting_parts"
            ? "WAITING FOR PARTS"
            : null;
  const list = (jobs.data?.items ?? []).filter((j) => reason(j)).slice(0, 5);
  return (
    <div>
      <SectionTitle>Needs attention</SectionTitle>
      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <Card className="text-sm text-muted">Nothing needs attention right now.</Card>
      ) : (
        <div className="space-y-3">
          {list.map((j) => (
            <Card key={j.id} className="py-4">
              <div className="font-semibold text-ink">
                {j.number} · {j.device.model}
              </div>
              <div className={`text-sm ${j.status === "unrepairable" ? "text-danger" : "text-muted"}`}>
                {reason(j)} · {j.customer.name}
              </div>
              <Link href={`/jobs/${j.id}`} className="mt-1 inline-block text-sm font-semibold text-info hover:underline">
                Open ›
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard() {
  const { data } = useApi<Usage>("/company/usage");
  const row = (label: string, value: string) => (
    <div className="flex justify-between border-t border-line py-2 text-sm text-muted">
      <span>{label}</span>
      <b className="whitespace-nowrap text-ink">{value}</b>
    </div>
  );
  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">Your plan</h2>
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="my-2 text-[28px] font-bold text-navy">{data.plan?.name ?? "No plan"}</div>
          {row("Jobs this month", fmtLimit(data.jobsThisMonth.used, data.jobsThisMonth.limit))}
          {row("Sites", fmtLimit(data.sites.used, data.sites.limit))}
          {row("Users", fmtLimit(data.users.used, data.users.limit))}
          <Link href="/settings/company" className="mt-3 inline-block text-sm font-semibold text-info hover:underline">
            Open ›
          </Link>
        </>
      )}
    </Card>
  );
}

function JobCards() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Filter>("all");
  const search = useDebounced(q.trim());
  const jobs = useApi<Page<JobRow>>(`/jobs${qs({ q: search, status: status === "all" ? "" : status, limit: 9 })}`);
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search jobs, devices or customers" />
      <Pills label="Status" options={FILTERS} value={status} onChange={setStatus} />
      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : jobs.data.items.length === 0 ? (
        <Card className="text-sm text-muted">{search || status !== "all" ? "No jobs match." : "No jobs you can see yet."}</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.data.items.map((j) => (
            <Card key={j.id} className="py-4">
              <div className="text-xs font-semibold text-info">{j.number}</div>
              <div className="font-semibold text-ink">{j.device.model}</div>
              <div className="mb-2 text-sm text-muted">
                {j.customer.name} · {j.site.name}
              </div>
              <StatusChip status={j.status} />
              <div>
                <Link href={`/jobs/${j.id}`} className="mt-2 inline-block text-sm font-semibold text-info hover:underline">
                  Open ›
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
