"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { PartRequest } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { RequestList } from "@/components/part-requests";
import { Alert, ButtonLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, Pills } from "@/components/ui";

/** Stock keeper (and leads): technicians' part requests. Give parts takes them out of stock onto the job. */
export function RequestsPage() {
  const { can } = useSession();
  const allowed = can("stock_keeper", "company_admin", "site_manager", "head_technician");
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const list = useApi<PartRequest[]>(allowed ? `/part-requests?status=${filter}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      list.reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const rows = list.data ?? [];
  const waiting = rows.filter((r) => r.status === "pending");
  const short = waiting.filter((r) => r.inStock < r.qty).length;
  return (
    <>
      <PageHeader
        title="Part requests"
        subtitle="Technicians ask for parts here. Give parts takes them out of the site stock and puts them on the job"
        actions={
          <ButtonLink href="/stock" variant="secondary">
            Back to stock
          </ButtonLink>
        }
      />
      {filter === "pending" && list.data && (
        <KpiRow>
          <Kpi label="Waiting" value={waiting.length} caption="Requests to decide" tone="warn" icon="box" />
          <Kpi label="Not enough stock" value={short} caption="Stock in first, or reject" tone="danger" icon="box" />
          <Kpi label="Jobs waiting" value={new Set(waiting.map((r) => r.job.id)).size} caption="Held up until parts arrive" tone="info" icon="wrench" />
        </KpiRow>
      )}
      <Pills
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "pending", label: "Waiting" },
          { value: "all", label: "All requests" },
        ]}
      />
      {error && <Alert>{error}</Alert>}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white px-4 py-10 text-center text-sm text-muted shadow-[0_1px_2px_rgba(0,0,0,.05)]">{filter === "pending" ? "No requests waiting. Technicians ask for parts from the job's Record test page." : "No part requests yet."}</div>
      ) : (
        <RequestList rows={rows} busy={busy} run={run} />
      )}
    </>
  );
}
