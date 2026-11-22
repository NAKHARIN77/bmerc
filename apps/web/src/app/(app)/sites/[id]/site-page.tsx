"use client";

import { ROLE_LABEL } from "@bmerc/shared";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { JobRow, Page, PartRow, Site, Team } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { SiteStatusChip, StatusChip } from "@/components/chips";
import { ButtonLink, CellLink, Chip, ErrorState, Loading, PageHeader, Pills, Table } from "@/components/ui";

type Tab = "teams" | "technicians" | "jobs" | "stock";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "teams", label: "Teams" },
  { value: "technicians", label: "Technicians" },
  { value: "jobs", label: "Jobs" },
  { value: "stock", label: "Stock" },
];

export function SitePage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("teams");
  const site = useApi<Site>(me.role ? `/sites/${id}` : null);
  const teams = useApi<Team[]>(me.role ? "/teams" : null);
  const jobs = useApi<Page<JobRow>>(me.role && tab === "jobs" ? `/jobs?siteId=${id}&limit=100` : null);
  const stock = useApi<Page<PartRow>>(me.role && tab === "stock" ? `/parts?siteId=${id}&limit=100` : null);

  if (!me.role) return <NoAccess />;
  const back = (
    <ButtonLink href="/sites" variant="secondary">
      Back to sites
    </ButtonLink>
  );
  if (site.error) {
    return (
      <>
        <PageHeader title="Site" actions={back} />
        <ErrorState error={site.error} onRetry={site.reload} />
      </>
    );
  }
  if (!site.data) return <Loading />;
  const s = site.data;
  const here = (teams.data ?? []).filter((t) => t.siteId === s.id);
  const people = here.flatMap((t) => t.members.map((m) => ({ ...m, team: t.name })));

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={["Site detail", [s.province, s.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        actions={
          <>
            {back}
            {can("company_admin") && (
              <ButtonLink href={`/sites/${s.id}/edit`} variant="secondary">
                Edit site
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <SiteStatusChip status={s.status} />
        {s.address && <span className="text-sm text-muted">{s.address}</span>}
      </div>
      <Pills label="Site sections" options={TABS} value={tab} onChange={setTab} />

      {tab === "teams" &&
        (!teams.data ? (
          <Loading />
        ) : (
          <Table
            rows={here}
            rowKey={(t) => t.id}
            empty="No teams at this site yet"
            columns={[
              { header: "Team", cell: (t) => (can("company_admin", "site_manager") ? <CellLink href={`/teams/${t.id}/edit`}>{t.name}</CellLink> : t.name) },
              { header: "Head technician", cell: (t) => t.members.find((m) => m.id === t.headUserId)?.fullName ?? "Not set" },
              { header: "Technicians", cell: (t) => t.members.length },
              { header: "Jobs open", cell: (t) => t.jobsOpen },
            ]}
          />
        ))}

      {tab === "technicians" &&
        (!teams.data ? (
          <Loading />
        ) : (
          <Table
            rows={people}
            rowKey={(m) => m.id}
            empty="No technicians at this site yet"
            columns={[
              { header: "Technician", cell: (m) => (m.isActive ? m.fullName : <span className="text-muted line-through">{m.fullName}</span>) },
              { header: "Role", cell: (m) => (m.role ? ROLE_LABEL[m.role] : "—") },
              { header: "Team", cell: (m) => m.team },
              { header: "Open jobs", cell: (m) => m.jobsOpen },
              { header: "Completed (QC)", cell: (m) => m.jobsDone },
            ]}
          />
        ))}

      {tab === "jobs" &&
        (jobs.error ? (
          <ErrorState error={jobs.error} onRetry={jobs.reload} />
        ) : !jobs.data ? (
          <Loading />
        ) : (
          <Table
            rows={jobs.data.items}
            rowKey={(j) => j.id}
            onRowClick={(j) => router.push(`/jobs/${j.id}`)}
            empty="No jobs at this site that you can see"
            columns={[
              { header: "Ticket", className: "whitespace-nowrap", cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink> },
              { header: "Machine model", cell: (j) => j.device.model },
              { header: "Customer", cell: (j) => j.customer.name },
              { header: "Status", className: "whitespace-nowrap", cell: (j) => <StatusChip status={j.status} /> },
              { header: "Technician", cell: (j) => j.assignee?.fullName ?? "Unassigned" },
            ]}
          />
        ))}

      {tab === "stock" &&
        (stock.error ? (
          <ErrorState error={stock.error} onRetry={stock.reload} />
        ) : !stock.data ? (
          <Loading />
        ) : (
          <Table
            rows={stock.data.items}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(`/parts/${p.id}`)}
            empty="No parts in the catalog yet"
            columns={[
              { header: "Part", cell: (p) => <CellLink href={`/parts/${p.id}`}>{p.name}</CellLink> },
              { header: "SKU", cell: (p) => p.sku },
              { header: "Qty", cell: (p) => `${p.totalQty} ${p.unit}` },
              { header: "Minimum", cell: (p) => p.minQty },
              { header: "Status", cell: (p) => (p.totalQty === 0 ? <Chip tone="danger">Out</Chip> : p.totalQty < p.minQty ? <Chip tone="danger">Low</Chip> : <Chip tone="success">OK</Chip>) },
            ]}
          />
        ))}
    </>
  );
}
