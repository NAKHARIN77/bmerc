"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { SiteStatusChip } from "@/components/chips";
import { ErrorState, Kpi, KpiRow, Loading, PageHeader, SearchBar, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import type { SiteStatus } from "@bmerc/shared";

interface OwnerSite {
  id: string;
  name: string;
  country: string | null;
  province: string | null;
  status: SiteStatus;
  company: { id: string; name: string };
  teams: number;
  technicians: number;
  openJobs: number;
  partsInStock: number;
}

/** Owner "Sites": every repair-center site of every company. */
export function SitesPage() {
  return (
    <OwnerOnly>
      <Sites />
    </OwnerOnly>
  );
}

function Sites() {
  const router = useRouter();
  const list = useApi<OwnerSite[]>("/platform/sites");
  const [q, setQ] = useState("");
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const n = q.trim().toLowerCase();
  const shown = list.data.filter((s) => !n || [s.name, s.company.name, s.country, s.province].some((v) => v?.toLowerCase().includes(n)));
  const active = list.data.filter((s) => s.status === "active").length;
  return (
    <>
      <PageHeader title="Sites" subtitle="Repair-center sites of every company" />
      <KpiRow>
        <Kpi label="Total sites" value={list.data.length} caption="All companies" icon="pin" />
        <Kpi label="Active" value={active} caption="Taking repair jobs" tone="success" icon="pin" />
        <Kpi label="Setup / inactive" value={list.data.length - active} caption="Not taking jobs" tone="warn" icon="pin" />
      </KpiRow>
      <SearchBar value={q} onChange={setQ} placeholder="Search by site, company or city" />
      <Table
        rows={shown}
        rowKey={(s) => s.id}
        onRowClick={(s) => router.push(`/platform/companies/${s.company.id}`)}
        empty="No site matches"
        columns={[
          { header: "Site", className: "min-w-[160px]", cell: (s) => s.name },
          { header: "Company", className: "min-w-[160px]", cell: (s) => s.company.name },
          { header: "Country", cell: (s) => s.country ?? "—" },
          { header: "City / Province", cell: (s) => s.province ?? "—" },
          { header: "Status", cell: (s) => <SiteStatusChip status={s.status} /> },
          { header: "Teams", cell: (s) => s.teams },
          { header: "Technicians", cell: (s) => s.technicians },
          { header: "Open jobs", cell: (s) => s.openJobs },
          { header: "Parts", cell: (s) => s.partsInStock },
        ]}
      />
    </>
  );
}
