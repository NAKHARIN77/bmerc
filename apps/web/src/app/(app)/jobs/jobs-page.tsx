"use client";

import { JOB_STATUS_LABEL, type JobStatus } from "@bmerc/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { JobRow, JobSummary, Page, Site } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { StatusChip } from "@/components/chips";
import { ButtonLink, CellLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pager, Pills, SearchBar, Select, Table } from "@/components/ui";

const LIMIT = 20;
type Filter = "all" | JobStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  ...(["todo", "in_repair", "waiting_parts", "unrepairable", "qc_passed", "dispatched"] as const).map((s) => ({ value: s, label: JOB_STATUS_LABEL[s] })),
];

export function JobsPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Filter>("all");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  const allowed = !!me.role;
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  const summary = useApi<JobSummary>(allowed ? `/jobs/summary${qs({ siteId })}` : null);
  const jobs = useApi<Page<JobRow>>(allowed ? `/jobs${qs({ q: search, status: status === "all" ? "" : status, siteId, page, limit: LIMIT })}` : null);

  if (!allowed) return <NoAccess />;

  const s = summary.data;
  const manySites = (sites.data?.length ?? 0) > 1;
  const subtitle = can("head_technician", "technician")
    ? "Jobs at your team's site that nobody has taken yet, or that someone in your team holds"
    : me.siteIds === null
      ? "Active hardware in repair across all sites"
      : "Active hardware in repair at your sites";

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={subtitle}
        actions={can("company_admin", "site_manager", "head_technician") ? <ButtonLink href="/jobs/new">+ New ticket</ButtonLink> : undefined}
      />
      <KpiRow>
        <Kpi label="All jobs" value={s?.total ?? "—"} caption="Active and historic" />
        <Kpi label="In repair" value={s?.byStatus.in_repair ?? "—"} caption="Active bench diagnostics" tone="info" />
        <Kpi label="Waiting & intake" value={s ? s.byStatus.todo + s.byStatus.waiting_parts : "—"} caption="Pending triage" tone="warn" />
      </KpiRow>

      <SearchBar
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Search ticket, serial or customer"
      >
        {manySites && (
          <div className="w-full sm:w-[180px]">
            <Select
              aria-label="Site"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sites</option>
              {sites.data!.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </SearchBar>
      <Pills
        label="Status"
        options={FILTERS}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={jobs.data.items}
            rowKey={(j) => j.id}
            onRowClick={(j) => router.push(`/jobs/${j.id}`)}
            empty={search || status !== "all" || siteId ? "No jobs match these filters" : "No jobs yet"}
            columns={[
              {
                header: "Ticket",
                className: "whitespace-nowrap",
                cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink>,
              },
              {
                header: "Machine model",
                className: "min-w-[170px]",
                cell: (j) => j.device.model,
              },
              {
                header: "Customer",
                className: "min-w-[140px]",
                cell: (j) => j.customer.name,
              },
              {
                header: "Status",
                className: "whitespace-nowrap",
                cell: (j) => <StatusChip status={j.status} />,
              },
              {
                header: "Technician",
                className: "whitespace-nowrap",
                cell: (j) => j.assignee?.fullName ?? "Unassigned",
              },
            ]}
          />
          <Pager page={jobs.data.page} limit={jobs.data.limit} total={jobs.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
