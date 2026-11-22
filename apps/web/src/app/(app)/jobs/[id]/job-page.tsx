"use client";

import { DEVICE_KIND_LABEL, JOB_STATUS_LABEL, type JobStatus } from "@bmerc/shared";
import { useParams } from "next/navigation";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { JobDetail } from "@/lib/types";
import { PriorityChip, StatusChip } from "@/components/chips";
import { ButtonLink, Card, Chip, ErrorState, Facts, Loading, PageHeader, SectionTitle, Table } from "@/components/ui";

// Prototype timeline: each status lights up the steps it has reached.
const STEPS = ["Intake", "Diagnosis", "Repair", "QC test", "Ready for release"] as const;
const REACHED: Record<JobStatus, number> = { todo: 1, in_repair: 2, waiting_parts: 2, unrepairable: 2, qc_passed: 4, dispatched: 5 };
const RESULT: Record<JobDetail["components"][number]["result"], string> = { repaired: "Repaired", replaced: "Replaced", unchanged: "Not changed" };

export function JobPage() {
  const { id } = useParams<{ id: string }>();
  const job = useApi<JobDetail>(`/jobs/${id}`);

  if (job.error) {
    return (
      <>
        <PageHeader title="Job" actions={<ButtonLink href="/jobs" variant="secondary">Back to jobs</ButtonLink>} />
        <ErrorState error={job.error} onRetry={job.reload} />
      </>
    );
  }
  if (!job.data) return <Loading />;
  const j = job.data;
  const reached = REACHED[j.status];

  return (
    <>
      <PageHeader
        title={`Job ${j.number}`}
        subtitle={`${j.device.model} · ${j.customer.name} · ${j.site.name}`}
        actions={
          <ButtonLink href="/jobs" variant="secondary">
            Back to jobs
          </ButtonLink>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <SectionTitle>Device and fault</SectionTitle>
          <Facts
            items={[
              ["Model", j.device.model],
              ["Serial number", j.device.serialNo],
              ["Type", DEVICE_KIND_LABEL[j.device.kind]],
              ["Status", <StatusChip key="s" status={j.status} />],
              ["Hashrate", j.device.hashrateTh ? `${Number(j.device.hashrateTh)} TH/s` : "—"],
              ["Technician", j.assignee?.fullName ?? "Unassigned"],
              ["Reported fault", j.reportedFault ?? "—"],
              ["Priority", <PriorityChip key="p" priority={j.priority} />],
              ["Received", fmtDateTime(j.receivedAt)],
              ["Customer contact", [j.customer.contactName, j.customer.phone, j.customer.email].filter(Boolean).join(" · ") || "—"],
            ]}
          />
          {j.unrepairableReason && (
            <div className="mt-4 rounded-lg bg-field p-3 text-sm">
              <div className="text-xs text-muted">Why it cannot be repaired</div>
              <div className="text-ink">{j.unrepairableReason}</div>
            </div>
          )}
          {j.workNote && (
            <div className="mt-4 rounded-lg bg-field p-3 text-sm">
              <div className="text-xs text-muted">Work note</div>
              <div className="whitespace-pre-wrap text-ink">{j.workNote}</div>
            </div>
          )}
          <SectionTitle className="mt-6">Parts used</SectionTitle>
          <Table
            rows={j.parts}
            rowKey={(p) => p.id}
            empty="No parts used yet"
            columns={[
              { header: "Part", cell: (p) => p.part.name },
              { header: "Qty", cell: (p) => `${p.qty} ${p.part.unit}` },
              { header: "SKU", cell: (p) => p.part.sku },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>Timeline</SectionTitle>
          <ol className="mb-5 space-y-3 text-sm">
            {STEPS.map((step, i) => (
              <li key={step} className={`flex items-center gap-2 ${i < reached ? "text-ink" : "text-muted"}`}>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${i < reached ? "bg-navy" : "border border-muted"}`} />
                {step}
              </li>
            ))}
          </ol>
          {j.status === "unrepairable" && <Chip tone="danger">Cannot repair</Chip>}
          {j.events.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-muted">History</h3>
              <ol className="space-y-2 border-l-2 border-soft pl-3 text-sm">
                {j.events.map((e) => (
                  <li key={e.id}>
                    <div className="text-ink">
                      {e.fromStatus ? `${JOB_STATUS_LABEL[e.fromStatus]} → ` : ""}
                      {JOB_STATUS_LABEL[e.toStatus]}
                    </div>
                    <div className="text-xs text-muted">{fmtDateTime(e.createdAt)}</div>
                    {e.note && <div className="text-xs text-muted">{e.note}</div>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle>QR label for this device</SectionTitle>
        <p className="mb-4 text-sm text-muted">Created when the job passes QC. Technicians scan it to see the full repair history of this device.</p>
        <Facts
          items={[
            ["QR code", j.device.qrCode ?? "—"],
            ["Label status", j.device.qrCode ? <Chip key="q" tone="success">Created</Chip> : <Chip key="q" tone="warn">Created after QC</Chip>],
          ]}
        />
        <div className="mt-5">
          <Table
            rows={j.components}
            rowKey={(c) => c.id}
            empty="No component work recorded yet"
            columns={[
              { header: "Component", cell: (c) => c.component },
              { header: "Board serial", cell: (c) => (c.replacementSerialNo ? `${c.serialNo ?? "—"} → ${c.replacementSerialNo}` : (c.serialNo ?? "—")) },
              { header: "Work done", cell: (c) => c.workDone ?? "—" },
              { header: "Result", cell: (c) => RESULT[c.result] },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
