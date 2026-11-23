"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import type { PlatformCompany } from "@/lib/platform";
import type { Page, StockLevel } from "@/lib/types";
import { Chip, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pager, Pills, SearchBar, Select, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";

interface Row {
  qty: number;
  level: StockLevel;
  site: { id: string; name: string; company: { id: string; name: string } };
  part: { id: string; name: string; sku: string; unit: string; minQty: number };
}
interface StockData extends Page<Row> {
  counts: { skus: number; low: number; out: number };
}

/** Owner "Stock": spare parts by site across every company. */
export function StockPage() {
  return (
    <OwnerOnly>
      <Stock />
    </OwnerOnly>
  );
}

function Stock() {
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [level, setLevel] = useState<"all" | "low" | "out">("all");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const companies = useApi<PlatformCompany[]>("/platform/companies");
  const stock = useApi<StockData>(`/platform/stock${qs({ q: search, companyId, level, page, limit: 20 })}`);
  const c = stock.data?.counts;
  return (
    <>
      <PageHeader title="Stock" subtitle="Spare parts by site, with stock levels, across all companies" />
      <KpiRow>
        <Kpi label="Total SKUs" value={c?.skus ?? "—"} caption="Registered parts" icon="box" />
        <Kpi label="Low stock" value={c?.low ?? "—"} caption="Below minimum level" tone="danger" icon="box" />
        <Kpi label="Out of stock" value={c?.out ?? "—"} caption="Needs reorder" tone="danger" icon="box" />
      </KpiRow>
      <SearchBar
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Search item name or SKU"
      >
        <div className="w-full sm:w-[240px]">
          <Select
            aria-label="Company"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Company: All</option>
            {(companies.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </div>
      </SearchBar>
      <Pills
        label="Level"
        value={level}
        onChange={(v) => {
          setLevel(v);
          setPage(1);
        }}
        options={[
          { value: "all", label: "All" },
          { value: "low", label: "Low" },
          { value: "out", label: "Out" },
        ]}
      />
      {stock.error ? (
        <ErrorState error={stock.error} onRetry={stock.reload} />
      ) : !stock.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={stock.data.items}
            rowKey={(r) => `${r.site.id}:${r.part.id}`}
            empty="No stock matches"
            columns={[
              { header: "Item", className: "min-w-[160px]", cell: (r) => r.part.name },
              { header: "SKU", cell: (r) => r.part.sku },
              { header: "Company", className: "min-w-[150px]", cell: (r) => r.site.company.name },
              { header: "Site", className: "min-w-[150px]", cell: (r) => r.site.name },
              { header: "Qty", cell: (r) => `${r.qty} ${r.part.unit}` },
              { header: "Minimum", cell: (r) => r.part.minQty },
              { header: "Status", cell: (r) => <Chip tone={r.level === "ok" ? "success" : "danger"}>{r.level === "ok" ? "OK" : r.level === "low" ? "Low" : "Out"}</Chip> },
            ]}
          />
          <Pager page={stock.data.page} limit={stock.data.limit} total={stock.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
