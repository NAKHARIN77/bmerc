"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import type { RepairInvoice } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, Chip, ErrorState, Field, Input, Loading, PageHeader, Select, Table } from "@/components/ui";

const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const METHOD = { bank_transfer: "Bank transfer", cash: "Cash", other: "Other" } as const;
const STATUS = {
  unpaid: <Chip tone="warn">Unpaid</Chip>,
  partial: <Chip tone="info">Part paid</Chip>,
  paid: <Chip tone="success">Paid</Chip>,
  void: <Chip tone="neutral">Void</Chip>,
} as const;
const PRINT_CSS = `@media print { aside, header, .no-print { display: none !important; } main { margin: 0 !important; padding: 0 !important; } }`;

/** Repair invoice: printable for the customer, with payments received and their balance. */
export function RepairInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager");
  const inv = useApi<RepairInvoice>(allowed ? `/job-invoices/${id}` : null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "other">("bank_transfer");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;
  if (inv.error) return <ErrorState error={inv.error} onRetry={inv.reload} />;
  if (!inv.data) return <Loading />;
  const i = inv.data;
  const balance = i.totalCents - i.paidCents;
  const tax = `${(i.taxRateBps / 100).toFixed(i.taxRateBps % 100 ? 2 : 0)}%`;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setAmount("");
      setRef("");
      inv.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHeader
        title={`Invoice ${i.number}`}
        subtitle={`Job ${i.job.number} · ${i.job.customer.name}`}
        actions={
          <span className="no-print flex flex-wrap gap-2.5">
            <ButtonLink href={`/jobs/${i.job.id}`} variant="secondary">
              Back to job
            </ButtonLink>
            {i.status === "unpaid" && (
              <ButtonLink href={`/jobs/${i.job.id}/invoice`} variant="secondary">
                Edit
              </ButtonLink>
            )}
            <Button onClick={() => window.print()}>Print</Button>
          </span>
        }
      />
      {error && <Alert>{error}</Alert>}
      <Card>
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <b className="text-lg text-navy">{i.company.legalName ?? i.company.name}</b>
            {i.company.taxId && <div className="text-sm text-muted">Tax ID {i.company.taxId}</div>}
            {i.company.billingAddress && <div className="whitespace-pre-line text-sm text-muted">{i.company.billingAddress}</div>}
          </div>
          <div className="text-right text-sm">
            <div className="text-lg font-bold">INVOICE {i.number}</div>
            <div>Issued {fmtDate(i.issuedAt)}</div>
            {i.dueAt && <div>Due {fmtDate(i.dueAt)}</div>}
            <div className="mt-1">{STATUS[i.status]}</div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-muted">Bill to</div>
            <b>{i.job.customer.name}</b>
            {i.job.customer.contactName && <div>{i.job.customer.contactName}</div>}
            {i.job.customer.email && <div>{i.job.customer.email}</div>}
            {i.job.customer.phone && <div>{i.job.customer.phone}</div>}
          </div>
          <div>
            <div className="text-xs font-medium text-muted">Repair</div>
            <div>
              Job {i.job.number} · {i.job.device.model}
            </div>
            <div>Serial {i.job.device.serialNo}</div>
            <div>Site {i.job.site.name}</div>
          </div>
        </div>
        <div className="mt-5">
          <Table
            rows={i.lines}
            rowKey={(l) => l.id}
            columns={[
              { header: "Description", cell: (l) => l.description },
              { header: "Qty", cell: (l) => l.qty },
              { header: "Unit price", cell: (l) => money(l.unitPriceCents, i.currency) },
              { header: "Amount", className: "text-right", cell: (l) => money(l.amountCents, i.currency) },
            ]}
          />
        </div>
        <div className="ml-auto mt-4 max-w-[320px] space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(i.subtotalCents, i.currency)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Tax {tax}</span>
            <span>{money(i.taxCents, i.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-soft pt-1.5 font-bold">
            <span>Total</span>
            <span>{money(i.totalCents, i.currency)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Paid</span>
            <span>{money(i.paidCents, i.currency)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Balance</span>
            <span>{money(i.status === "void" ? 0 : balance, i.currency)}</span>
          </div>
        </div>
        {i.note && <p className="mt-4 whitespace-pre-line text-sm text-muted">{i.note}</p>}
        <p className="mt-4 text-xs text-muted">This is an invoice, not a tax invoice.</p>
      </Card>

      <div className="no-print mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <b className="text-base">Payments received</b>
          <div className="mt-3">
            <Table
              rows={i.payments}
              rowKey={(p) => p.id}
              empty="No payment recorded yet"
              columns={[
                { header: "Date", cell: (p) => fmtDate(p.paidAt) },
                { header: "Method", cell: (p) => METHOD[p.method] },
                { header: "Reference", cell: (p) => p.reference ?? "—" },
                { header: "Amount", cell: (p) => money(p.amountCents, i.currency) },
              ]}
            />
          </div>
        </Card>
        {i.status !== "void" && i.status !== "paid" && (
          <Card>
            <b className="text-base">Record a payment</b>
            <div className="mt-3 grid gap-x-3 sm:grid-cols-2">
              <Field label={`Amount (${i.currency})`}>
                {(fid) => <Input id={fid} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(balance / 100).toFixed(2)} />}
              </Field>
              <Field label="Method">
                {(fid) => (
                  <Select id={fid} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Reference (optional)">{(fid) => <Input id={fid} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank reference or receipt number" />}</Field>
            <div className="flex flex-wrap justify-between gap-2">
              {i.paidCents === 0 && (
                <Button
                  variant="danger"
                  busy={busy === "void"}
                  onClick={() => {
                    const reason = window.prompt("Why void this invoice?");
                    if (reason && reason.trim().length >= 3) void run("void", () => api(`/job-invoices/${i.id}/void`, { method: "POST", body: { reason } }));
                  }}
                >
                  Void invoice
                </Button>
              )}
              <Button
                busy={busy === "pay"}
                disabled={!(Number(amount) > 0)}
                onClick={() => run("pay", () => api(`/job-invoices/${i.id}/payments`, { method: "POST", body: { amountCents: Math.round(Number(amount) * 100), method, reference: ref.trim() || undefined } }))}
              >
                Record payment
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
