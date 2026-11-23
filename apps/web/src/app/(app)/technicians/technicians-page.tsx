"use client";

import { ROLE_LABEL } from "@bmerc/shared";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Technician } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, CellLink, ErrorState, Loading, PageHeader, Table } from "@/components/ui";

/** Prototype "Technicians": each technician and the jobs assigned to them. */
export function TechniciansPage() {
  const { can } = useSession();
  const router = useRouter();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const list = useApi<Technician[]>(allowed ? "/jobs/technicians" : null);
  if (!allowed) return <NoAccess />;

  return (
    <>
      <PageHeader
        title="Technicians"
        subtitle="Each technician in your company and the jobs assigned to them"
        actions={
          <>
            <ButtonLink href="/job-cards" variant="secondary">
              Technician job cards
            </ButtonLink>
            {can("company_admin") && <ButtonLink href="/users/new">+ Add technician</ButtonLink>}
          </>
        }
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Table
          rows={list.data}
          rowKey={(t) => t.id}
          onRowClick={(t) => router.push(`/technicians/${t.id}`)}
          empty="No technicians in a team yet. Add a technician and put them in a team at a site"
          columns={[
            { header: "Technician", cell: (t) => <CellLink href={`/technicians/${t.id}`}>{t.fullName}</CellLink> },
            { header: "Role", cell: (t) => (t.role ? ROLE_LABEL[t.role] : "—") },
            { header: "Team", cell: (t) => `${t.team.name} · ${t.site.name}` },
            { header: "Open jobs", emphasis: true, cell: (t) => t.openJobs },
            { header: "Completed (QC)", cell: (t) => t.atQc },
            {
              header: "",
              className: "text-right",
              cell: (t) => (
                <ButtonLink href={`/technicians/${t.id}`} variant="secondary" className="h-8">
                  View jobs
                </ButtonLink>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
