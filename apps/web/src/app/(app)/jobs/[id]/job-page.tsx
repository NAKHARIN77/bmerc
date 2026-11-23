"use client";

import { type JobStatus } from "@bmerc/shared";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/use-api";
import type { JobDetail } from "@/lib/types";
import { StatusChip } from "@/components/chips";
import { ButtonLink, Card, Chip, ErrorState, Facts, Loading, PageHeader, Table } from "@/components/ui";

// Prototype timeline: ● for steps reached, ○ (muted) for the rest.
const STEPS = ["Intake", "Diagnosis", "Repair", "QC test", "Ready for release"] as const;
const REACHED: Record<JobStatus, number> = { todo: 1, in_repair: 2, waiting_parts: 2, unrepairable: 2, qc_passed: 4, dispatched: 5 };
const RESULT: Record<JobDetail["components"][number]["result"], string> = { repaired: "Repaired", replaced: "Replaced", unchanged: "Not changed" };

export function JobPage() {
  const { id } = useParams<{ id: string }>();
  const job = useApi<JobDetail>(`/jobs/${id}`);
  const back = (
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
  const reached = REACHED[j.status];

  return (
    <>
      <PageHeader title={`Job ${j.number}`} subtitle={`${j.device.model} · ${j.customer.name} · ${j.site.name}`} actions={back} />
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
          <b className="mb-3 mt-5 block text-base">Parts used</b>
          <Table
            rows={j.parts}
            rowKey={(p) => p.id}
            empty="No parts used yet"
            columns={[
              { header: "Part", cell: (p) => p.part.name },
              { header: "Qty", cell: (p) => p.qty },
              { header: "SKU", cell: (p) => p.part.sku },
            ]}
          />
        </Card>
        <Card>
          <b className="text-base">Timeline</b>
          <div className="mt-4 leading-[2.2]">
            {STEPS.map((step, i) => (
              <div key={step} className={i < reached ? "" : "text-muted"}>
                {i < reached ? "●" : "○"} {step}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <b className="text-base">QR label for this device</b>
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
                  <Chip tone="warn">Pending</Chip>
                  <span className="mt-1 block">Created after QC</span>
                </span>
              ),
            ],
          ]}
        />
        <div className="mt-5">
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
    </>
  );
}
