"use client";

import { DEVICE_KIND_LABEL } from "@bmerc/shared";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import type { DeviceHistory } from "@/lib/types";
import { StatusChip } from "@/components/chips";
import { ButtonLink, CellLink, Chip, ErrorState, Kpi, KpiRow, Loading, PageHeader, Table } from "@/components/ui";

const RESULT = { repaired: "Repaired", replaced: "Replaced", unchanged: "Not changed" } as const;

/** Every job on one device, newest first (prototype: Device history (QR)). */
export function DevicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const d = useApi<DeviceHistory>(`/devices/${id}/history`);
  const actions = (
    <>
      <ButtonLink href="/scan" variant="secondary">
        Scan another
      </ButtonLink>
      <ButtonLink href="/board" variant="secondary">
        Back to board
      </ButtonLink>
    </>
  );
  if (d.error) {
    return (
      <>
        <PageHeader title="Device history" actions={actions} />
        <ErrorState error={d.error} onRetry={d.reload} />
      </>
    );
  }
  if (!d.data) return <Loading />;
  const v = d.data;
  const replaced = v.jobs.reduce((a, j) => a + j.components.filter((c) => c.result === "replaced").length + j.parts.reduce((n, p) => n + p.qty, 0), 0);
  const lastQc = v.jobs.find((j) => j.qcPassedAt);
  const lastUnrepairable = v.jobs.find((j) => j.status === "unrepairable" || j.unrepairableReason);
  const rows = v.jobs.flatMap((j) =>
    j.components.length
      ? j.components.map((c) => ({ key: c.id, job: j, component: c.serialNo ? `${c.component} (${c.replacementSerialNo ? `${c.serialNo} → ${c.replacementSerialNo}` : c.serialNo})` : c.component, work: c.workDone ?? RESULT[c.result] }))
      : [{ key: j.id, job: j, component: "—", work: j.workNote ?? j.unrepairableReason ?? j.reportedFault ?? "—" }],
  );

  return (
    <>
      <PageHeader
        title="Device history"
        subtitle={`${v.qrCode ? `QR ${v.qrCode} · ` : ""}${v.model} · ${DEVICE_KIND_LABEL[v.kind]} · Serial ${v.serialNo} · ${v.customer.name}`}
        actions={
          <>
            {v.qrCode && (
              <ButtonLink href={`/devices/${v.id}/label`} variant="secondary">
                Print QR label
              </ButtonLink>
            )}
            {actions}
          </>
        }
      />
      <KpiRow>
        <Kpi label="Jobs on this device" value={v.jobs.length} caption={v.jobs.length ? `Since ${fmtDate(v.jobs[v.jobs.length - 1].receivedAt)}` : "No jobs yet"} icon="wrench" />
        <Kpi label="Components replaced" value={replaced} caption="Boards replaced and parts used" tone="info" icon="box" />
        <Kpi
          label="Last QC"
          value={lastQc ? "Passed" : lastUnrepairable ? "Failed" : "—"}
          caption={lastQc ? fmtDate(lastQc.qcPassedAt) : lastUnrepairable ? "Could not be repaired" : "Not yet tested"}
          tone={lastQc ? "success" : lastUnrepairable ? "danger" : "navy"}
        />
      </KpiRow>
      <Table
        rows={rows}
        rowKey={(r) => r.key}
        onRowClick={(r) => router.push(`/jobs/${r.job.id}`)}
        empty="No repair recorded yet"
        columns={[
          { header: "Date", className: "whitespace-nowrap", cell: (r) => fmtDate(r.job.qcPassedAt ?? r.job.receivedAt) },
          { header: "Ticket", className: "whitespace-nowrap", cell: (r) => <CellLink href={`/jobs/${r.job.id}`}>{r.job.number}</CellLink> },
          { header: "Component", cell: (r) => r.component },
          { header: "Work done", cell: (r) => r.work },
          { header: "Technician", cell: (r) => r.job.assignee?.fullName ?? "—" },
          {
            header: "QC",
            cell: (r) =>
              r.job.qcPassedAt ? (
                <Chip tone="success">OK</Chip>
              ) : (
                <StatusChip status={r.job.status} />
              ),
          },
        ]}
      />
      {v.jobs.some((j) => j.parts.length) && (
        <>
          <h2 className="mb-3 mt-6 text-base font-bold">Parts used</h2>
          <Table
            rows={v.jobs.flatMap((j) => j.parts.map((p) => ({ ...p, job: j })))}
            rowKey={(p) => p.id}
            columns={[
              { header: "Ticket", cell: (p) => <CellLink href={`/jobs/${p.job.id}`}>{p.job.number}</CellLink> },
              { header: "Part", cell: (p) => p.part.name },
              { header: "SKU", cell: (p) => p.part.sku },
              { header: "Qty", cell: (p) => p.qty },
            ]}
          />
        </>
      )}
    </>
  );
}
