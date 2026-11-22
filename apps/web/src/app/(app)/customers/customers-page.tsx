"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { CustomerRow, CustomerSummary, Page } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, CellLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pager, Pills, SearchBar, Table } from "@/components/ui";

const LIMIT = 20;

export function CustomersPage() {
  const { can } = useSession();
  const router = useRouter();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const summary = useApi<CustomerSummary>(allowed ? "/customers/summary" : null);
  const list = useApi<Page<CustomerRow>>(allowed ? `/customers${qs({ q: search, country: country === "all" ? "" : country, page, limit: LIMIT })}` : null);

  if (!allowed) return <NoAccess />;
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="People and farms that send devices in for repair. Customers do not log in"
        actions={can("company_admin") && <ButtonLink href="/customers/new">+ Add customer</ButtonLink>}
      />
      <KpiRow>
        <Kpi label="Total customers" value={s?.customers ?? "—"} caption="On record" icon="building" />
        <Kpi label="Devices in" value={s?.devicesIn ?? "—"} caption="Not yet returned" tone="info" />
        <Kpi label="Open jobs" value={s?.openJobs ?? "—"} caption="In progress" tone="warn" icon="wrench" />
      </KpiRow>
      <SearchBar
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Search by customer name"
      />
      {s && s.countries.length > 1 && (
        <Pills
          label="Country"
          options={[{ value: "all", label: "All" }, ...s.countries.map((c) => ({ value: c, label: c }))]}
          value={country}
          onChange={(v) => {
            setCountry(v);
            setPage(1);
          }}
        />
      )}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={list.data.items}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/customers/${c.id}`)}
            empty={search || country !== "all" ? "No customers match" : "No customers yet"}
            columns={[
              { header: "Customer", cell: (c) => <CellLink href={`/customers/${c.id}`}>{c.name}</CellLink> },
              { header: "Country", cell: (c) => c.country ?? "—" },
              { header: "Devices", cell: (c) => c.devices },
              { header: "Open jobs", cell: (c) => c.openJobs },
            ]}
          />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
