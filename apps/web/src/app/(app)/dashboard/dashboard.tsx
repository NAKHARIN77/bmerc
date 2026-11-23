"use client";

import { JOB_STATUS_LABEL, type JobStatus } from "@bmerc/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { BillingInvoice } from "@/lib/billing";
import { fmtLimit } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { JobRow, JobSummary, Page, PartRow, Usage } from "@/lib/types";
import { StatusChip } from "@/components/chips";
import { PlatformDashboard } from "./platform-dashboard";
import { Alert, Button, ButtonLink, Card, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pills, SearchBar } from "@/components/ui";

type Filter = "all" | JobStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  ...(["todo", "in_repair", "waiting_parts", "unrepairable", "qc_passed"] as const).map((s) => ({ value: s, label: JOB_STATUS_LABEL[s] })),
];

export function Dashboard() {
  const { me, can } = useSession();
  const router = useRouter();
  const bench = can("head_technician", "technician");
  // Technicians start on their bench board (the prototype's technician app has no dashboard).
  useEffect(() => {
    if (bench) router.replace("/board");
  }, [bench, router]);
  if (bench) return null;

  if (me.isPlatformAdmin) return <PlatformDashboard />;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Your repair center at a glance"
        actions={
          can("company_admin", "site_manager") ? <ButtonLink href="/jobs/new">+ New ticket</ButtonLink> : undefined
        }
      />
      {can("company_admin") && <SetupReminder />}
      <Counts />
      <div className={`mb-5 grid gap-4 ${can("company_admin") ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
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
    <KpiRow>
      <Kpi label="Open jobs" value={s?.open ?? "—"} caption="Not yet passed QC" tone="info" />
      <Kpi label="In repair" value={s?.byStatus.in_repair ?? "—"} caption="Being repaired now" />
      <Kpi label="Waiting parts" value={s?.byStatus.waiting_parts ?? "—"} caption="Waiting for spare parts" tone="warn" />
      <Kpi label="Low stock" value={low ?? "—"} caption="Below minimum level, by site" tone="danger" />
    </KpiRow>
  );
}

/** Open jobs that need someone: urgent or high priority, waiting for parts, or cannot be repaired. */
function NeedsAttention() {
  const jobs = useApi<Page<JobRow>>("/jobs?open=true&limit=100");
  const canDispatch = useSession().can("company_admin", "site_manager");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now()); // when the page opened
  const waited = (j: JobRow) => Math.floor((now - Date.parse(j.receivedAt)) / 86_400_000);
  // A job nobody has taken for a day or more comes first, so it is not forgotten in the queue.
  const queued = (j: JobRow) => j.status === "todo" && !j.assignee && waited(j) >= 1;
  const reason = (j: JobRow) =>
    queued(j)
      ? `NO TECHNICIAN FOR ${waited(j)} ${waited(j) === 1 ? "DAY" : "DAYS"}`
      : j.status === "unrepairable"
      ? "Cannot repair"
      : j.priority === "urgent"
        ? "URGENT"
        : j.priority === "high"
          ? "HIGH PRIORITY"
          : j.status === "waiting_parts"
            ? "WAITING FOR PARTS"
            : null;
  const list = (jobs.data?.items ?? [])
    .filter((j) => reason(j))
    .sort((a, b) => Number(queued(b)) - Number(queued(a)))
    .slice(0, 5);
  return (
    <div>
      <b className="text-base">Needs attention</b>
      <div className="mt-3">
      {error && <Alert>{error}</Alert>}
      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <Card className="text-sm text-muted">Nothing needs attention right now.</Card>
      ) : (
        list.map((j) => (
          <div key={j.id} className="mb-2.5 rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
            <b>
              {j.number} · {j.device.model}
            </b>
            <div className="mt-1 text-[13px] text-muted">
              {reason(j)} · {j.customer.name}
            </div>
            {j.status === "unrepairable" && canDispatch && (
              <Button
                className="mt-3 h-[34px]"
                busy={busy === j.id}
                onClick={async () => {
                  if (!window.confirm(`Return ${j.device.model} (${j.number}) to ${j.customer.name}?`)) return;
                  setBusy(j.id);
                  setError(null);
                  try {
                    await api(`/jobs/${j.id}/transition`, { method: "POST", body: { to: "dispatched" } });
                    jobs.reload();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Confirm return to customer
              </Button>
            )}
            <Link href={`/jobs/${j.id}`} className="mt-3 block text-[13px] font-semibold text-info hover:underline">
              Open ›
            </Link>
          </div>
        ))
      )}
      </div>
    </div>
  );
}

function PlanCard() {
  const { data } = useApi<Usage>("/company/usage");
  const invoices = useApi<BillingInvoice[]>("/billing/invoices");
  const open = invoices.data?.filter((i) => i.status === "open") ?? [];
  const payment = !invoices.data ? "…" : open.some((i) => i.overdue) ? "Overdue" : open.length ? "Due" : "Paid";
  const row = (label: string, value: string) => (
    <div className="flex justify-between border-t-[0.5px] border-line py-2 text-[13px] text-muted">
      <span>{label}</span>
      <b className="whitespace-nowrap text-navy">{value}</b>
    </div>
  );
  return (
    <Card>
      <b className="text-base">Your plan</b>
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="my-2 text-[28px] font-bold text-navy">{data.plan?.name ?? "No plan"}</div>
          <div className={`mb-3.5 text-[13px] ${payment === "Overdue" ? "font-semibold text-danger" : "text-muted"}`}>Payment: {payment}</div>
          {row("Jobs this month", fmtLimit(data.jobsThisMonth.used, data.jobsThisMonth.limit))}
          {row("Sites", fmtLimit(data.sites.used, data.sites.limit))}
          {row("Users", fmtLimit(data.users.used, data.users.limit))}
          <Link href="/subscription" className="mt-3 inline-block text-[13px] font-semibold text-info hover:underline">
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
            <Link key={j.id} href={`/jobs/${j.id}`} className="block rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(0,99,152,.2)]">
              <div className="text-xs font-semibold text-info">{j.number}</div>
              <b className="my-1.5 block">{j.device.model}</b>
              <div className="text-[13px] text-muted">
                {j.customer.name} · {j.site.name}
              </div>
              <div className="mt-2.5">
                <StatusChip status={j.status} />
              </div>
              <div className="mt-3 text-[13px] font-semibold text-info">Open ›</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** New companies: a nudge to the setup wizard until the first site exists. */
function SetupReminder() {
  const sites = useApi<Array<{ id: string }>>("/sites");
  if (!sites.data || sites.data.length > 0) return null;
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 !bg-[#e7eefe]">
      <div>
        <b className="text-base text-navy">Finish setting up your company</b>
        <p className="mt-1 text-sm text-muted">Add your sites, teams and staff so you can start receiving devices.</p>
      </div>
      <ButtonLink href="/setup">Open setup</ButtonLink>
    </Card>
  );
}
