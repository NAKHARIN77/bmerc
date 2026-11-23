"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import type { Site, StockPage } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, Chip, ErrorState, Field, Input, Loading, PageHeader, Pills, Select, Table } from "@/components/ui";

interface Transfer {
  id: string;
  qty: number;
  status: "in_transit" | "received" | "cancelled";
  note: string | null;
  sentAt: string;
  closedAt: string | null;
  fromSite: { id: string; name: string };
  toSite: { id: string; name: string };
  part: { id: string; name: string; sku: string; unit: string };
  sentBy: string | null;
  closedBy: string | null;
  canReceive: boolean;
  canCancel: boolean;
}
type Filter = "in_transit" | "received" | "cancelled" | "all";
const STATUS = {
  in_transit: <Chip tone="warn">In transit</Chip>,
  received: <Chip tone="success">Received</Chip>,
  cancelled: <Chip tone="neutral">Cancelled</Chip>,
} as const;

/** Send parts from one site to another; the receiving site confirms arrival. */
export function TransfersPage() {
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager", "stock_keeper");
  const [filter, setFilter] = useState<Filter>("in_transit");
  const list = useApi<Transfer[]>(allowed ? `/stock/transfers?status=${filter}` : null);
  const mySites = useApi<Site[]>(allowed ? "/sites" : null);
  const allSites = useApi<Array<{ id: string; name: string }>>(allowed ? "/stock/transfer-sites" : null);
  const [from, setFrom] = useState("");
  const fromId = from || mySites.data?.[0]?.id || "";
  const stock = useApi<StockPage>(allowed && fromId ? `/stock?siteId=${fromId}&limit=100` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;
  const available = (stock.data?.items ?? []).filter((r) => r.qty > 0);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      list.reload();
      stock.reload();
      return true;
    } catch (e) {
      const f = e instanceof ApiError ? Object.values(e.fieldErrors())[0] : null;
      setError(f ?? errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = { fromSiteId: fromId, toSiteId: String(f.get("to") ?? ""), partId: String(f.get("part") ?? ""), qty: Number(f.get("qty")), note: String(f.get("note") ?? "").trim() || undefined };
    if (await run("send", () => api("/stock/transfers", { method: "POST", body }))) form.reset();
  }

  return (
    <>
      <PageHeader
        title="Stock transfers"
        subtitle="Send spare parts to another site. The receiving site confirms when they arrive"
        actions={
          <ButtonLink href="/stock" variant="secondary">
            Back to stock
          </ButtonLink>
        }
      />
      {error && <Alert>{error}</Alert>}
      <Card className="mb-4">
        <b className="text-base">Send parts</b>
        <form onSubmit={send} noValidate className="mt-3 grid gap-x-4 md:grid-cols-3">
          <Field label="From site">
            {(id) => (
              <Select id={id} value={fromId} onChange={(e) => setFrom(e.target.value)}>
                {(mySites.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="To site">
            {(id) => (
              <Select id={id} name="to" required>
                <option value="">Pick a site…</option>
                {(allSites.data ?? [])
                  .filter((s) => s.id !== fromId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Part">
            {(id) => (
              <Select id={id} name="part" required key={fromId}>
                <option value="">{stock.data ? (available.length ? "Pick a part…" : "Nothing in stock at this site") : "Loading…"}</option>
                {available.map((r) => (
                  <option key={r.part.id} value={r.part.id}>
                    {r.part.name} · {r.qty} {r.part.unit} here
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Quantity">{(id) => <Input id={id} name="qty" type="number" min={1} defaultValue={1} required />}</Field>
          <Field label="Note (optional)">{(id) => <Input id={id} name="note" placeholder="e.g. Courier tracking 123" />}</Field>
          <div className="flex items-end justify-end pb-4">
            <Button type="submit" busy={busy === "send"}>
              Send parts
            </Button>
          </div>
        </form>
      </Card>
      <Pills
        label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "in_transit", label: "In transit" },
          { value: "received", label: "Received" },
          { value: "cancelled", label: "Cancelled" },
          { value: "all", label: "All" },
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Table
          rows={list.data}
          rowKey={(t) => t.id}
          empty="No transfers"
          columns={[
            { header: "Sent", className: "whitespace-nowrap", cell: (t) => fmtDateTime(t.sentAt) },
            { header: "Part", cell: (t) => `${t.part.name} (${t.part.sku})` },
            { header: "Qty", cell: (t) => `${t.qty} ${t.part.unit}` },
            { header: "From", cell: (t) => t.fromSite.name },
            { header: "To", cell: (t) => t.toSite.name },
            { header: "By", cell: (t) => t.sentBy ?? "—" },
            { header: "Status", cell: (t) => STATUS[t.status] },
            {
              header: "",
              className: "whitespace-nowrap text-right",
              cell: (t) => (
                <div className="flex justify-end gap-2">
                  {t.canReceive && (
                    <Button className="h-8" busy={busy === t.id} onClick={() => run(t.id, () => api(`/stock/transfers/${t.id}/receive`, { method: "POST" }))}>
                      Confirm received
                    </Button>
                  )}
                  {t.canCancel && (
                    <Button className="h-8" variant="secondary" busy={busy === `c${t.id}`} onClick={() => window.confirm("Cancel this transfer? The parts go back into stock at the sending site.") && run(`c${t.id}`, () => api(`/stock/transfers/${t.id}/cancel`, { method: "POST" }))}>
                      Cancel
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
