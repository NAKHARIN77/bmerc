"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { Page, PartRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, CellLink, Chip, ErrorState, Loading, PageHeader, Pager, SearchBar, Select, Table } from "@/components/ui";

const LIMIT = 20;

export function PartStatus({ part }: { part: Pick<PartRow, "isActive" | "belowMin"> }) {
  if (!part.isActive) return <Chip>Retired</Chip>;
  return part.belowMin ? <Chip tone="danger">Low</Chip> : <Chip tone="success">OK</Chip>;
}

export function PartsPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
    const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const categories = useApi<string[]>(me.role ? "/parts/categories" : null);
  const list = useApi<Page<PartRow>>(me.role ? `/parts${qs({ q: search, category, active: "all", page, limit: LIMIT })}` : null);

  if (!me.role) return <NoAccess />;

  return (
    <>
      <PageHeader
        title="Parts catalog"
        subtitle="Master list of spare parts. Stock in, out and adjust pick from this list"
        actions={can("company_admin", "stock_keeper") && <ButtonLink href="/parts/new">+ Add part</ButtonLink>}
      />
      <SearchBar
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Search part name or SKU"
      >
        <div className="w-full sm:w-[180px]">
          <Select
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </SearchBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={list.data.items}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(`/parts/${p.id}`)}
            empty={search || category ? "No parts match" : "No parts yet"}
            columns={[
              {
                header: "Part",
                cell: (p) => <CellLink href={`/parts/${p.id}`}>{p.name}</CellLink>,
              },
              {
                header: "SKU",
                className: "whitespace-nowrap",
                cell: (p) => p.sku,
              },
              { header: "Unit", cell: (p) => p.unit },
              { header: "Minimum", cell: (p) => p.minQty },
              { header: "Total stock", cell: (p) => p.totalQty },
              { header: "Status", cell: (p) => <PartStatus part={p} /> },
            ]}
          />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
