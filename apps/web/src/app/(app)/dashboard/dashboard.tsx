"use client";

import { JOB_STATUS_LABEL, type JobStatus } from "@bmerc/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDate, fmtLimit } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Page, Usage } from "@/lib/types";
import { Card, Chip, ErrorState, Kpi, Loading, PageHeader, Table } from "@/components/ui";

interface JobRow {
  id: string;
  number: string;
  status: JobStatus;
  receivedAt: string;
  device: { kind: string; model: string; serialNo: string };
  customer: { name: string };
  site: { name: string };
  assignee: { fullName: string } | null;
}

const OPEN: JobStatus[] = ["todo", "in_repair", "waiting_parts", "unrepairable"];
const STATUS_TONE: Record<JobStatus, "info" | "success" | "warn" | "danger" | "neutral" | "navy"> = {
  todo: "info",
  in_repair: "success",
  waiting_parts: "warn",
  unrepairable: "danger",
  qc_passed: "neutral",
  dispatched: "neutral",
};

export function StatusChip({ status }: { status: JobStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{JOB_STATUS_LABEL[status]}</Chip>;
}

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

  const scope =
    me.siteIds === null ? "All sites in your company" : me.siteIds.length ? `Your ${me.siteIds.length === 1 ? "site" : `${me.siteIds.length} sites`}` : "No site assigned yet";

  return (
    <>
      <PageHeader title="Overview" subtitle={`${me.company?.name ?? ""} · ${scope}`} />
      <JobCounts />
      <div className={`mt-5 grid gap-4 ${can("company_admin") ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
        <RecentJobs />
        {can("company_admin") && <PlanCard />}
      </div>
    </>
  );
}

/** One count per open status, each limited to what this user may see (the API applies the scope). */
function JobCounts() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    Promise.all(OPEN.map((s) => api<Page<JobRow>>(`/jobs?status=${s}&limit=1`).then((p) => [s, p.total] as const)))
      .then((pairs) => setCounts(Object.fromEntries(pairs)))
      .catch(setError);
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!counts) return <Loading />;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi label="To do" value={counts.todo} caption="Waiting for a technician" tone="info" icon="wrench" />
      <Kpi label="In repair" value={counts.in_repair} caption="On the bench now" tone="success" icon="wrench" />
      <Kpi label="Waiting for parts" value={counts.waiting_parts} caption="Blocked on stock" tone="warn" icon="box" />
      <Kpi label="Cannot repair" value={counts.unrepairable} caption="Waiting to go back to the customer" tone="danger" icon="wrench" />
    </div>
  );
}

function RecentJobs() {
  const { data, error, loading, reload } = useApi<Page<JobRow>>("/jobs?limit=8");
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-navy">Latest jobs</h2>
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading || !data ? (
        <Loading />
      ) : (
        <Table
          rows={data.items}
          rowKey={(j) => j.id}
          empty="No jobs you can see yet"
          columns={[
            { header: "Job", className: "whitespace-nowrap", cell: (j) => <span className="font-semibold text-info">{j.number}</span> },
            {
              header: "Device",
              cell: (j) => (
                <div>
                  <div>{j.device.model}</div>
                  <div className="whitespace-nowrap text-xs text-muted">{j.device.serialNo}</div>
                </div>
              ),
            },
            { header: "Customer", cell: (j) => j.customer.name },
            { header: "Site", cell: (j) => j.site.name },
            { header: "Status", cell: (j) => <StatusChip status={j.status} /> },
            { header: "Received", className: "whitespace-nowrap", cell: (j) => fmtDate(j.receivedAt) },
          ]}
        />
      )}
    </div>
  );
}

function PlanCard() {
  const { data } = useApi<Usage>("/company/usage");
  const row = (label: string, value: string) => (
    <div className="flex justify-between border-t border-line py-2 text-sm text-muted">
      <span>{label}</span>
      <b className="whitespace-nowrap text-navy">{value}</b>
    </div>
  );
  return (
    <Card>
      <h2 className="text-base font-semibold text-navy">Your plan</h2>
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="my-2 text-2xl font-bold text-navy">{data.plan?.name ?? "No plan"}</div>
          {row("Jobs this month", fmtLimit(data.jobsThisMonth.used, data.jobsThisMonth.limit))}
          {row("Sites", fmtLimit(data.sites.used, data.sites.limit))}
          {row("Active users", fmtLimit(data.users.used, data.users.limit))}
        </>
      )}
    </Card>
  );
}
