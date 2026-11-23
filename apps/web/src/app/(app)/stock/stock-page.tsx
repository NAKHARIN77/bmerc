"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { Site, StockLevel, StockPage as StockPageData } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, CellLink, Chip, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pager, Pills, SearchBar, Select, Table } from "@/components/ui";

const LIMIT = 20;
const LEVEL: Record<StockLevel, { tone: "success" | "danger"; label: string }> = {
  ok: { tone: "success", label: "OK" },
  low: { tone: "danger", label: "Low" },
  out: { tone: "danger", label: "Out" },
};

export const LevelChip = ({ level }: { level: StockLevel }) => <Chip tone={LEVEL[level].tone}>{LEVEL[level].label}</Chip>;

/** Spare parts by site, with stock levels. */
export function StockPage() {
  const { me, can } = useSession();
  const [q, setQ] = useState("");
  const [siteId, setSiteId] = useState("");
  const [level, setLevel] = useState<"all" | "low" | "out">("all");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const allowed = !!me.role;
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  const stock = useApi<StockPageData>(allowed ? `/stock${qs({ q: search, siteId, level, page, limit: LIMIT })}` : null);
  if (!allowed) return <NoAccess />;
  const manage = can("company_admin", "site_manager", "stock_keeper");
  const c = stock.data?.counts;

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Spare parts by site, with stock levels"
        actions={
          <>
            <ButtonLink href="/parts" variant="secondary">
              Parts catalog
            </ButtonLink>
            {manage && (
              <>
                <ButtonLink href="/stock/transfers" variant="secondary">
                  Transfers
                </ButtonLink>
                <ButtonLink href="/stock/move?type=out" variant="secondary">
                  Stock out
                </ButtonLink>
                <ButtonLink href="/stock/move?type=adjust" variant="secondary">
                  Adjust
                </ButtonLink>
                <ButtonLink href="/stock/move?type=in">+ Stock in</ButtonLink>
              </>
            )}
          </>
        }
      />
      <KpiRow>
        <Kpi label="Total SKUs" value={c?.skus ?? "—"} caption="Parts held at your sites" icon="box" />
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
        {(sites.data?.length ?? 0) > 1 && (
          <div className="w-full sm:w-[220px]">
            <Select
              aria-label="Site"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Site: All</option>
              {sites.data!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}
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
            empty={search || level !== "all" ? "No stock matches these filters" : "No stock recorded yet. Use Stock in to add parts"}
            columns={[
              { header: "Item", className: "min-w-[180px]", cell: (r) => <CellLink href={`/parts/${r.part.id}`}>{r.part.name}</CellLink> },
              { header: "SKU", cell: (r) => r.part.sku },
              { header: "Site", className: "min-w-[150px]", cell: (r) => r.site.name },
              { header: "Qty", emphasis: true, cell: (r) => `${r.qty} ${r.part.unit}` },
              { header: "Minimum", cell: (r) => r.part.minQty },
              { header: "Status", cell: (r) => <LevelChip level={r.level} /> },
            ]}
          />
          <Pager page={stock.data.page} limit={stock.data.limit} total={stock.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
