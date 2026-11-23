"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { usd, type PlatformInvoice } from "@/lib/platform";
import type { Page } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, ErrorState, Input, Loading, PageHeader, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { InvoiceChip } from "../owner-chips";

/**
 * Prototype "Pending payments": open invoices waiting for confirmation. Confirm records how it was paid
 * (until a payment provider confirms automatically); Reject clears an uploaded slip and keeps the invoice open.
 */
export function PendingPage() {
  return (
    <OwnerOnly>
      <Pending />
    </OwnerOnly>
  );
}

function Pending() {
  const list = useApi<Page<PlatformInvoice>>("/platform/invoices?status=open&limit=100");
  const [confirming, setConfirming] = useState<PlatformInvoice | null>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setConfirming(null);
      setRef("");
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Pending payments"
        subtitle="Payments waiting for confirmation, or overdue"
        actions={
          <ButtonLink href="/platform/payments" variant="secondary">
            All payments
          </ButtonLink>
        }
      />
      {error && <Alert>{error}</Alert>}
      {confirming && (
        <Card className="mb-4 max-w-[640px]">
          <b>
            Confirm {confirming.number} · {confirming.company.name} · {usd(confirming.totalCents, confirming.currency)}
          </b>
          <label htmlFor="pay-ref" className="mb-1.5 mt-3 block text-xs font-medium text-muted">
            How was it paid? (method and reference, e.g. Bank transfer KBank 1234)
          </label>
          <Input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} autoFocus />
          <div className="mt-3 flex gap-2.5">
            <Button busy={busy === "confirm"} disabled={ref.trim().length < 2} onClick={() => run("confirm", () => api(`/platform/invoices/${confirming.id}/mark-paid`, { method: "POST", body: { paymentRef: ref.trim() } }))}>
              Confirm payment
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Table
          rows={list.data.items}
          rowKey={(i) => i.id}
          empty="No pending payments"
          columns={[
            { header: "Date", className: "whitespace-nowrap", cell: (i) => fmtDate(i.createdAt) },
            { header: "Company", className: "min-w-[160px]", cell: (i) => i.company.name },
            { header: "Amount", className: "whitespace-nowrap", cell: (i) => usd(i.totalCents, i.currency) },
            { header: "Due", className: "whitespace-nowrap", cell: (i) => fmtDate(i.dueAt) },
            { header: "Status", cell: (i) => <InvoiceChip invoice={i} /> },
            {
              header: "Action",
              className: "whitespace-nowrap",
              cell: (i) => (
                <div className="flex gap-2">
                  <Button className="h-8" onClick={() => (setConfirming(i), setRef(""))}>
                    Confirm
                  </Button>
                  <Button
                    className="h-8"
                    variant="secondary"
                    busy={busy === i.id}
                    onClick={() => window.confirm(`Reject the payment for ${i.number}? The invoice stays open and the company has to pay again.`) && run(i.id, () => api(`/platform/invoices/${i.id}/reject`, { method: "POST", body: {} }))}
                  >
                    Reject
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
