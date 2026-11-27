"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { PartDetail } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, CellLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, SectionTitle, Table } from "@/components/ui";

const TYPE = { in: "Stock in", out: "Stock out", adjust: "Adjust" } as const;

export function PartPage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const part = useApi<PartDetail>(me.role ? `/parts/${id}` : null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.role) return <NoAccess />;
  const back = (
    <ButtonLink href="/parts" variant="secondary">
      Back to parts
    </ButtonLink>
  );
  if (part.error) {
    return (
      <>
        <PageHeader title="Part" actions={back} />
        <ErrorState error={part.error} onRetry={part.reload} />
      </>
    );
  }
  if (!part.data) return <Loading />;
  const p = part.data;
  const total = p.stock.reduce((a, s) => a + s.qty, 0);
  const low = p.stock.some((s) => s.belowMin);

  async function remove() {
    if (!window.confirm(`Delete ${p.name} (${p.sku}) from the parts catalog?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ outcome: "deleted" | "retired" }>(`/parts/${p.id}`, { method: "DELETE" });
      router.push(`/parts?${new URLSearchParams({ done: r.outcome, name: p.name })}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`${p.sku} · Unit: ${p.unit} · Minimum: ${p.minQty}`}
        actions={
          <>
            {back}
            {can("company_admin", "stock_keeper") && (
              <>
                <Button variant="danger" busy={busy} onClick={remove}>
                  Delete part
                </Button>
                <ButtonLink href={`/parts/${p.id}/edit`}>Edit part</ButtonLink>
              </>
            )}
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      <KpiRow>
        <Kpi label="Total stock" value={total} caption={me.siteIds === null ? "All sites" : "Your sites"} />
        <Kpi label="Minimum" value={p.minQty} caption="Required level" tone="info" />
        <Kpi
          label="Status"
          value={!p.isActive ? "Retired" : low ? "Low" : "OK"}
          caption={!p.isActive ? "No longer stocked" : "Current"}
          tone={!p.isActive ? "neutral" : low ? "warn" : "success"}
        />
      </KpiRow>
      <Table
        rows={p.stock}
        rowKey={(s) => s.site.id}
        empty="No stock recorded at your sites yet"
        columns={[
          { header: "Site", cell: (s) => s.site.name },
          { header: "Qty", emphasis: true, cell: (s) => s.qty },
        ]}
      />
      <SectionTitle className="mt-6">Recent movements</SectionTitle>
      <Table
        rows={p.movements}
        rowKey={(m) => m.id}
        empty="No stock movements yet"
        columns={[
          { header: "Date", className: "whitespace-nowrap", cell: (m) => fmtDateTime(m.createdAt) },
          { header: "Type", cell: (m) => TYPE[m.type] },
          { header: "Qty", cell: (m) => (m.qty > 0 ? `+${m.qty}` : m.qty) },
          { header: "Site", cell: (m) => m.site.name },
          { header: "Reference", cell: (m) => (m.job ? <CellLink href={`/jobs/${m.job.id}`}>{m.job.number}</CellLink> : (m.reason ?? "—")) },
          { header: "By", cell: (m) => m.by ?? "—" },
        ]}
      />
    </>
  );
}
