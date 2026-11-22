"use client";

import { DEVICE_KIND_LABEL, JOB_STATUS_LABEL, JOB_STATUSES, type JobStatus } from "@bmerc/shared";
import { useState, type ReactNode } from "react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { JobDetail, JobRow, Page, Site } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { PriorityChip, StatusChip } from "@/components/chips";
import { DetailList, Drawer, ErrorState, Field, Input, Loading, Note, PageHeader, Pager, Select, Table, Toolbar } from "@/components/ui";

const LIMIT = 20;

export function JobsPage() {
  const { me, can } = useSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const search = useDebounced(q.trim());

  const allowed = !!me.role;
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  const jobs = useApi<Page<JobRow>>(allowed ? `/jobs${qs({ q: search, status, siteId, page, limit: LIMIT })}` : null);

  if (!allowed) return <NoAccess />;

  const isTech = can("head_technician", "technician");
  const filtered = !!(search || status || siteId);

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={
          isTech
            ? "Jobs at your team's site that nobody has taken yet, or that someone in your team holds"
            : me.siteIds === null
              ? "Every repair job in your company"
              : "Repair jobs at your sites"
        }
      />
      <Toolbar>
        <Field label="Search">
          {(id) => (
            <Input
              id={id}
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Job number or serial"
            />
          )}
        </Field>
        <Field label="Status">
          {(id) => (
            <Select
              id={id}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as JobStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {sites.data && sites.data.length > 1 && (
          <Field label="Site">
            {(id) => (
              <Select
                id={id}
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All sites</option>
                {sites.data!.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </Toolbar>

      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={jobs.data.items}
            rowKey={(j) => j.id}
            onRowClick={(j) => setOpenId(j.id)}
            empty={filtered ? "No jobs match these filters" : "No jobs yet"}
            columns={[
              { header: "Job", className: "whitespace-nowrap", cell: (j) => <span className="font-semibold text-navy">{j.number}</span> },
              {
                header: "Device",
                className: "min-w-[190px]",
                cell: (j) => (
                  <div>
                    <div>{j.device.model}</div>
                    <div className="whitespace-nowrap text-xs text-muted">
                      {DEVICE_KIND_LABEL[j.device.kind]} · {j.device.serialNo}
                    </div>
                  </div>
                ),
              },
              { header: "Customer", className: "min-w-[120px]", cell: (j) => j.customer.name },
              { header: "Site", className: "min-w-[150px]", cell: (j) => j.site.name },
              { header: "Technician", className: "whitespace-nowrap", cell: (j) => j.assignee?.fullName ?? <span className="text-muted">Not taken</span> },
              { header: "Priority", cell: (j) => <PriorityChip priority={j.priority} /> },
              { header: "Status", className: "whitespace-nowrap", cell: (j) => <StatusChip status={j.status} /> },
              { header: "Received", className: "whitespace-nowrap", cell: (j) => fmtDate(j.receivedAt) },
            ]}
          />
          <Pager page={jobs.data.page} limit={jobs.data.limit} total={jobs.data.total} onPage={setPage} />
        </>
      )}

      <Drawer open={openId !== null} title="Job details" onClose={() => setOpenId(null)}>
        {openId && <JobPanel key={openId} id={openId} />}
      </Drawer>
    </>
  );
}

function JobPanel({ id }: { id: string }) {
  const job = useApi<JobDetail>(`/jobs/${id}`);
  if (job.error) return <ErrorState error={job.error} onRetry={job.reload} />;
  if (!job.data) return <Loading />;
  const j = job.data;
  const rows: Array<[string, ReactNode]> = [
    ["Status", <StatusChip key="s" status={j.status} />],
    ["Priority", <PriorityChip key="p" priority={j.priority} />],
    ["Site", j.site.name],
    ["Technician", j.assignee?.fullName ?? "Not taken"],
    ["Received", fmtDateTime(j.receivedAt)],
    ["Device", `${DEVICE_KIND_LABEL[j.device.kind]} · ${j.device.model}`],
    ["Serial", j.device.serialNo],
    ["Customer", j.customer.name],
    ["Contact", [j.customer.contactName, j.customer.phone, j.customer.email].filter(Boolean).join(" · ") || "—"],
  ];
  return (
    <>
      <h3 className="mb-3 text-xl font-bold text-navy">{j.number}</h3>
      <DetailList rows={rows} />
      {j.reportedFault && <Note title="Reported fault">{j.reportedFault}</Note>}
      {j.workNote && <Note title="Work note">{j.workNote}</Note>}
      {j.unrepairableReason && <Note title="Why it cannot be repaired">{j.unrepairableReason}</Note>}
      <h4 className="mb-2 mt-5 text-sm font-semibold text-navy">History</h4>
      {j.events.length === 0 ? (
        <p className="text-sm text-muted">No status changes yet.</p>
      ) : (
        <ol className="border-l-2 border-soft pl-4 text-sm">
          {j.events.map((e) => (
            <li key={e.id} className="mb-3">
              <div className="text-ink">
                {e.fromStatus ? `${JOB_STATUS_LABEL[e.fromStatus]} → ` : ""}
                {JOB_STATUS_LABEL[e.toStatus]}
              </div>
              <div className="text-xs text-muted">{fmtDateTime(e.createdAt)}</div>
              {e.note && <div className="mt-1 text-muted">{e.note}</div>}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-6 text-xs text-muted">Opening jobs, assigning them and changing status come with the repair workflow.</p>
    </>
  );
}
