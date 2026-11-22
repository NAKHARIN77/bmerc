"use client";

import { ROLE_LABEL } from "@bmerc/shared";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { JobRow, Page, Team } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { StatusChip } from "@/components/chips";
import { ButtonLink, CellLink, ErrorState, Loading, PageHeader, SectionTitle, Table } from "@/components/ui";

export function TeamsPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const canManage = can("company_admin", "site_manager");
  const teams = useApi<Team[]>(me.role ? "/teams" : null);
  const jobs = useApi<Page<JobRow>>(me.role ? "/jobs?assigned=true&limit=100" : null);

  if (!me.role) return <NoAccess />;

  const role = new Map((teams.data ?? []).flatMap((t) => t.members.map((m) => [m.id, m.role] as const)));

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Each site, its head technician, and the status of each technician job"
        actions={canManage && <ButtonLink href="/teams/new">+ Add team</ButtonLink>}
      />
      {teams.error ? (
        <ErrorState error={teams.error} onRetry={teams.reload} />
      ) : !teams.data ? (
        <Loading />
      ) : (
        <Table
          rows={teams.data}
          rowKey={(t) => t.id}
          onRowClick={canManage ? (t) => router.push(`/teams/${t.id}/edit`) : undefined}
          empty="No teams yet"
          columns={[
            {
              header: "Team",
              cell: (t) => (canManage ? <CellLink href={`/teams/${t.id}/edit`}>{t.name}</CellLink> : t.name),
            },
            { header: "Site", cell: (t) => t.site.name },
            {
              header: "Head technician",
              cell: (t) => t.members.find((m) => m.id === t.headUserId)?.fullName ?? "Not set",
            },
            { header: "Technicians", cell: (t) => t.members.length },
            { header: "Jobs open", cell: (t) => t.jobsOpen },
            { header: "Jobs done", cell: (t) => t.jobsDone },
          ]}
        />
      )}

      <SectionTitle className="mt-6">Jobs by technician</SectionTitle>
      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : (
        <Table
          rows={[...jobs.data.items].sort((a, b) => (a.assignee?.fullName ?? "").localeCompare(b.assignee?.fullName ?? ""))}
          rowKey={(j) => j.id}
          onRowClick={(j) => router.push(`/jobs/${j.id}`)}
          empty="No jobs are assigned yet"
          columns={[
            { header: "Technician", cell: (j) => j.assignee?.fullName ?? "—" },
            {
              header: "Role",
              cell: (j) => {
                const r = j.assignee ? role.get(j.assignee.id) : null;
                return r ? ROLE_LABEL[r] : "—";
              },
            },
            {
              header: "Ticket",
              className: "whitespace-nowrap",
              cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink>,
            },
            { header: "Device", cell: (j) => j.device.model },
            {
              header: "Status",
              className: "whitespace-nowrap",
              cell: (j) => <StatusChip status={j.status} />,
            },
          ]}
        />
      )}
    </>
  );
}
