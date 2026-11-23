"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { SiteStatusChip } from "@/components/chips";
import { ButtonLink, CellLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, SearchBar, Table } from "@/components/ui";

export function SitesPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const isAdmin = can("company_admin");
  const sites = useApi<Site[]>(me.role ? "/sites" : null);
  const [q, setQ] = useState("");

  if (!me.role) return <NoAccess />;

  const all = sites.data ?? [];
  const term = q.trim().toLowerCase();
  const shown = term ? all.filter((s) => [s.name, s.province, s.country].some((v) => v?.toLowerCase().includes(term))) : all;
  const active = all.filter((s) => s.status === "active").length;

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Your repair center branches. Customers send devices to a site for repair"
        actions={
          isAdmin && (
            <>
              <ButtonLink href="/users/new" variant="secondary">
                + Add technician
              </ButtonLink>
              <ButtonLink href="/sites/new">+ Add site</ButtonLink>
            </>
          )
        }
      />
      <KpiRow>
        <Kpi label="Total sites" value={sites.data ? all.length : "—"} caption="Registered locations" />
        <Kpi label="Active" value={sites.data ? active : "—"} caption="Taking repair jobs" tone="success" />
        <Kpi label="Setup / inactive" value={sites.data ? all.length - active : "—"} caption="Not taking jobs" tone="warn" />
      </KpiRow>
      <SearchBar value={q} onChange={setQ} placeholder="Search by site or city" />
      {sites.error ? (
        <ErrorState error={sites.error} onRetry={sites.reload} />
      ) : !sites.data ? (
        <Loading />
      ) : (
        <Table
          rows={shown}
          rowKey={(s) => s.id}
          onRowClick={(s) => router.push(`/sites/${s.id}`)}
          empty={term ? "No sites match" : isAdmin ? "No sites yet. Add your first branch" : "You are not linked to a site yet. Ask your company admin"}
          columns={[
            { header: "Site", cell: (s) => <CellLink href={`/sites/${s.id}`}>{s.name}</CellLink> },
            { header: "Country", cell: (s) => s.country ?? "—" },
            { header: "City / province", cell: (s) => s.province ?? "—" },
            { header: "Status", cell: (s) => <SiteStatusChip status={s.status} /> },
            { header: "Team", cell: (s) => s.teams.map((t) => t.name).join(", ") || "Unassigned" },
            { header: "Parts", cell: (s) => s.partsStocked },
          ]}
        />
      )}
      {isAdmin && <p className="mt-3 text-xs text-muted">Sites cannot be deleted because they hold stock and job history. Set a site to Inactive instead; inactive sites do not count toward your plan.</p>}
    </>
  );
}
