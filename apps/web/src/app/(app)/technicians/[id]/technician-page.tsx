"use client";

import { ROLE_LABEL } from "@bmerc/shared";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { JobRow, Page, Technician } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { StatusChip } from "@/components/chips";
import { ButtonLink, CellLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, Table } from "@/components/ui";

/** Prototype "Technician jobs": one technician's jobs. */
export function TechnicianPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const router = useRouter();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const techs = useApi<Technician[]>(allowed ? "/jobs/technicians" : null);
  const jobs = useApi<Page<JobRow>>(allowed ? `/jobs?assigneeId=${id}&limit=100` : null);
  if (!allowed) return <NoAccess />;
  const back = (
    <ButtonLink href="/technicians" variant="secondary">
      Back to technicians
    </ButtonLink>
  );
  if (techs.error || jobs.error) return <ErrorState error={(techs.error ?? jobs.error)!} onRetry={() => (techs.reload(), jobs.reload())} />;
  if (!techs.data || !jobs.data) return <Loading />;
  const t = techs.data.find((x) => x.id === id);
  if (!t) {
    return (
      <>
        <PageHeader title="Technician" actions={back} />
        <p className="text-muted">This technician is not in one of your teams.</p>
      </>
    );
  }
  const mine = jobs.data.items;

  return (
    <>
      <PageHeader title={t.fullName} subtitle={`${t.role ? ROLE_LABEL[t.role] : "—"} · ${t.team.name} · Jobs assigned to this technician`} actions={back} />
      <KpiRow>
        <Kpi label="Assigned" value={mine.length} caption="All jobs" icon="wrench" />
        <Kpi label="In repair" value={mine.filter((j) => j.status === "in_repair").length} caption="Active now" tone="info" icon="wrench" />
        <Kpi label="Passed to QC" value={mine.filter((j) => j.status === "qc_passed").length} caption="Ready for dispatch" tone="success" icon="wrench" />
      </KpiRow>
      <Table
        rows={mine}
        rowKey={(j) => j.id}
        onRowClick={(j) => router.push(`/jobs/${j.id}`)}
        empty="No jobs assigned"
        columns={[
          { header: "Ticket", className: "whitespace-nowrap", cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink> },
          { header: "Device", cell: (j) => j.device.model },
          { header: "Task", cell: (j) => j.workNote || j.reportedFault || "—" },
          { header: "Status", cell: (j) => <StatusChip status={j.status} /> },
        ]}
      />
    </>
  );
}
