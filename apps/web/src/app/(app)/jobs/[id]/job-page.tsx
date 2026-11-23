"use client";

import { JOB_STATUS_LABEL, type JobStatus } from "@bmerc/shared";
import { useParams, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import type { ComponentResult, JobDetail } from "@/lib/types";
import { StatusChip } from "@/components/chips";
import { Alert, ButtonLink, Card, Chip, ErrorState, Facts, Loading, PageHeader, Table } from "@/components/ui";

// Prototype timeline: ● for steps reached, ○ (muted) for the rest.
const STEPS = ["Intake", "Diagnosis", "Repair", "QC test", "Ready for release"] as const;
const REACHED: Record<JobStatus, number> = { todo: 1, in_repair: 2, waiting_parts: 2, unrepairable: 2, qc_passed: 4, dispatched: 5 };
const RESULT: Record<ComponentResult, string> = { repaired: "Repaired", replaced: "Replaced", unchanged: "Not changed" };

/** Job detail, as in the prototype. Status changes happen on the bench board; tests and parts on the test record page. */
export function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const received = useSearchParams().get("received");
  const job = useApi<JobDetail>(`/jobs/${id}`);
  const bench = can("head_technician", "technician");
  const back = bench ? (
    <ButtonLink href="/board" variant="secondary">
      Back to board
    </ButtonLink>
  ) : (
    <ButtonLink href="/jobs" variant="secondary">
      Back to jobs
    </ButtonLink>
  );

  if (job.error) {
    return (
      <>
        <PageHeader title="Job" actions={back} />
        <ErrorState error={job.error} onRetry={job.reload} />
      </>
    );
  }
  if (!job.data) return <Loading />;
  const j = job.data;
  const testable = j.can.work && (j.status === "in_repair" || j.status === "waiting_parts");

  return (
    <>
      <PageHeader
        title={`Job ${j.number}`}
        subtitle={`${j.device.model} · ${j.customer.name} · ${j.site.name}`}
        actions={
          <>
            {back}
            {testable && (
              <ButtonLink href={`/jobs/${j.id}/test`} variant="secondary">
                Record test
              </ButtonLink>
            )}
            {j.status !== "dispatched" && <ButtonLink href="/board">Update status</ButtonLink>}
          </>
        }
      />
      {received && (
        <div className="mb-4 rounded-lg bg-[#d1fae5] px-4 py-3 font-semibold text-success">
          Job {j.number} received. It is now in To Do on the technician board.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <b className="text-base">Device and fault</b>
          <div className="mt-4">
            <Facts
              items={[
                ["Model", j.device.model],
                ["Serial number", j.device.serialNo],
                ["Hashrate", j.device.hashrateTh ? `${Number(j.device.hashrateTh)} TH/s` : "—"],
                ["Status", <StatusChip key="s" status={j.status} />],
                ["Reported fault", j.reportedFault ?? "—"],
                ["Technician", j.assignee?.fullName ?? "Unassigned"],
              ]}
            />
          </div>
          {j.unrepairableReason && (
            <div className="mt-4">
              <Alert>Cannot repair: {j.unrepairableReason}</Alert>
            </div>
          )}
          <b className="mb-3 mt-6 block text-base">Parts used</b>
          <Table
            rows={j.parts}
            rowKey={(p) => p.id}
            empty="No parts used yet"
            columns={[
              { header: "Part", cell: (p) => p.part.name },
              { header: "Qty", emphasis: true, cell: (p) => p.qty },
              { header: "SKU", cell: (p) => p.part.sku },
            ]}
          />
        </Card>
        <Card>
          <b className="text-base">Timeline</b>
          <div className="mt-4 leading-[2.2]">
            {STEPS.map((step, i) => (
              <div key={step} className={i < REACHED[j.status] ? "" : "text-muted"}>
                {i < REACHED[j.status] ? "●" : "○"} {step}
              </div>
            ))}
          </div>
          <b className="mt-5 block text-sm">History</b>
          <ol className="mt-2 space-y-3 border-l-2 border-soft pl-4 text-sm">
            {j.events.map((e) => (
              <li key={e.id}>
                <div className="font-semibold text-ink">
                  {e.fromStatus === null ? "Received" : e.fromStatus === e.toStatus ? (e.note ?? "Updated") : JOB_STATUS_LABEL[e.toStatus]}
                </div>
                {e.note && e.fromStatus !== e.toStatus && (e.fromStatus !== null || e.note !== "Device received") && <div className="text-ink">{e.note}</div>}
                <div className="text-xs text-muted">
                  {fmtDateTime(e.createdAt)}
                  {e.by ? ` · ${e.by}` : ""}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <b className="text-base">QR label for this device</b>
          {j.device.qrCode && <ButtonLink href={`/devices/${j.device.id}/label?job=${j.id}`}>Print QR label</ButtonLink>}
        </div>
        <p className="mb-4 mt-4 text-muted">Created when the job passes QC. Technicians scan it to see the full repair history of this device.</p>
        <Facts
          items={[
            ["QR code", j.device.qrCode ?? "—"],
            [
              "Label status",
              j.device.qrCode ? (
                <Chip key="q" tone="success">
                  Created
                </Chip>
              ) : (
                <span key="q">
                  <Chip tone="warn">Pending</Chip> <b className="font-medium">Created after QC</b>
                </span>
              ),
            ],
          ]}
        />
        <div className="mt-4">
          <Table
            rows={j.components}
            rowKey={(c) => c.id}
            empty="No component work recorded yet"
            columns={[
              { header: "Component", cell: (c) => (c.serialNo ? `${c.component} (${c.replacementSerialNo ? `${c.serialNo} → ${c.replacementSerialNo}` : c.serialNo})` : c.component) },
              { header: "Work done", cell: (c) => c.workDone ?? "—" },
              { header: "Result", cell: (c) => RESULT[c.result] },
            ]}
          />
        </div>
      </Card>
      {j.can.bill && <InvoiceCard job={j} />}
    </>
  );
}

const MONEY = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const INVOICE_STATUS = { unpaid: "Unpaid", partial: "Part paid", paid: "Paid", void: "Void" } as const;

/** The job's repair invoice to the customer (admins and site managers). */
function InvoiceCard({ job: j }: { job: JobDetail }) {
  const inv = j.invoice;
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b className="text-base">Repair invoice</b>
          <p className="mt-1 text-sm text-muted">
            {inv
              ? `${inv.number} · ${MONEY(inv.totalCents, inv.currency)} · paid ${MONEY(inv.paidCents, inv.currency)} · ${INVOICE_STATUS[inv.status]}`
              : "No invoice yet. Bill the customer for labor and the parts used."}
          </p>
        </div>
        {inv ? <ButtonLink href={`/repair-invoices/${inv.id}`}>Open invoice</ButtonLink> : <ButtonLink href={`/jobs/${j.id}/invoice`}>Create invoice</ButtonLink>}
      </div>
    </Card>
  );
}
