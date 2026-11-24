"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { usd, type PlatformInvoice } from "@/lib/platform";
import type { Page } from "@/lib/types";
import { Icon } from "@/components/icons";
import { Alert, Button, ButtonLink, Chip, ErrorState, Input, Kpi, KpiRow, Loading, PageHeader, Pills } from "@/components/ui";
import { OwnerOnly } from "../owner-only";

/**
 * Prototype "Pending payments": open plan invoices. Companies that reported a bank transfer come first, so the
 * owner can check the bank and confirm. Confirm records how it was paid (until a payment provider confirms
 * automatically); Reject clears the report and keeps the invoice open.
 */
export function PendingPage() {
  return (
    <OwnerOnly>
      <Pending />
    </OwnerOnly>
  );
}

type Filter = "all" | "reported" | "overdue" | "waiting";
const DAY = 86_400_000;

function Pending() {
  const list = useApi<Page<PlatformInvoice>>("/platform/invoices?status=open&limit=100");
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => Date.now());
  const [confirming, setConfirming] = useState<string | null>(null);
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

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const all = [...list.data.items].sort((a, b) => Number(!!b.slipUploadedAt) - Number(!!a.slipUploadedAt) || Number(b.overdue) - Number(a.overdue) || a.dueAt.localeCompare(b.dueAt));
  const kind = (i: PlatformInvoice): Exclude<Filter, "all"> => (i.slipUploadedAt ? "reported" : i.overdue ? "overdue" : "waiting");
  const count = (k: Exclude<Filter, "all">) => all.filter((i) => kind(i) === k).length;
  const shown = filter === "all" ? all : all.filter((i) => kind(i) === filter);
  const outstanding = all.reduce((a, i) => a + i.totalCents, 0);

  return (
    <>
      <PageHeader
        title="Pending payments"
        subtitle="Plan invoices not paid yet. Check the bank, then confirm the ones that arrived"
        actions={
          <ButtonLink href="/platform/payments" variant="secondary">
            All payments
          </ButtonLink>
        }
      />
      <KpiRow>
        <Kpi label="To confirm" value={count("reported")} caption="Company says it has paid" tone="info" icon="doc" />
        <Kpi label="Overdue" value={count("overdue")} caption="Past due, nothing reported" tone="danger" icon="doc" />
        <Kpi label="Outstanding" value={usd(outstanding)} caption={`${all.length} open ${all.length === 1 ? "invoice" : "invoices"}`} tone="warn" icon="doc" />
      </KpiRow>
      <Pills
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `All (${all.length})` },
          { value: "reported", label: `To confirm (${count("reported")})` },
          { value: "overdue", label: `Overdue (${count("overdue")})` },
          { value: "waiting", label: `Not due yet (${count("waiting")})` },
        ]}
      />
      {error && <Alert>{error}</Alert>}
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.05)]">
        {shown.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">{all.length ? "Nothing in this group." : "All plan invoices are paid. Nothing to confirm."}</div>
        ) : (
          <ul className="divide-y divide-soft">
            {shown.map((i) => {
              const k = kind(i);
              const late = Math.floor((now - Date.parse(i.dueAt)) / DAY);
              return (
                <li key={i.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/platform/companies/${i.company.id}`} className="text-[15px] font-semibold text-info hover:underline">
                          {i.company.name}
                        </Link>
                        {k === "reported" ? <Chip tone="info">Payment reported</Chip> : k === "overdue" ? <Chip tone="danger">Overdue</Chip> : <Chip tone="warn">Waiting for payment</Chip>}
                      </div>
                      <div className="mt-1 text-[13px] text-muted">
                        {i.number} · {i.plan ? `${i.plan} plan` : "Plan"} · {fmtDate(i.periodStart)} to {fmtDate(i.periodEnd)}
                      </div>
                      <div className="mt-2 text-[13px]">
                        {k === "reported" ? (
                          <span className="text-ink">
                            Reported {fmtDate(i.slipUploadedAt)}
                            {i.paymentRef && <> · <b>{i.paymentRef}</b></>}
                          </span>
                        ) : k === "overdue" ? (
                          <span className="font-semibold text-danger">
                            Due {fmtDate(i.dueAt)} · {late} {late === 1 ? "day" : "days"} late
                          </span>
                        ) : (
                          <span className="text-muted">Due {fmtDate(i.dueAt)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-navy">{usd(i.totalCents, i.currency)}</div>
                      <div className="text-[11px] text-muted">{i.taxCents ? `incl. VAT ${usd(i.taxCents, i.currency)}` : "No VAT"}</div>
                    </div>
                    <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                      <Button className="h-9 !bg-success hover:!bg-[#0b6b4f]" title="Confirm the money arrived" onClick={() => (setConfirming(i.id), setRef(i.paymentRef ?? ""))}>
                        <Icon name="check" size={16} strokeWidth={2.4} />
                        Paid
                      </Button>
                      {i.slipUploadedAt && (
                        <Button
                          className="h-9"
                          variant="secondary"
                          title="The money did not arrive: the company has to pay again"
                          busy={busy === i.id}
                          onClick={() => window.confirm(`Reject the payment report for ${i.number}? The invoice stays open and ${i.company.name} has to pay again.`) && run(i.id, () => api(`/platform/invoices/${i.id}/reject`, { method: "POST", body: {} }))}
                        >
                          <Icon name="close" size={16} strokeWidth={2.4} className="text-danger" />
                          Not received
                        </Button>
                      )}
                    </div>
                  </div>
                  {confirming === i.id && (
                    <div className="mt-3 rounded-lg bg-[#f5f8ff] p-3.5">
                      <label htmlFor={`ref-${i.id}`} className="mb-1.5 block text-xs font-medium text-muted">
                        How was it paid? Method and reference, e.g. Bank transfer KBank 1234
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Input id={`ref-${i.id}`} className="min-w-[220px] flex-1" value={ref} onChange={(e) => setRef(e.target.value)} autoFocus />
                        <Button busy={busy === "confirm"} disabled={ref.trim().length < 2} onClick={() => run("confirm", () => api(`/platform/invoices/${i.id}/mark-paid`, { method: "POST", body: { paymentRef: ref.trim() } }))}>
                          Confirm {usd(i.totalCents, i.currency)}
                        </Button>
                        <Button variant="secondary" onClick={() => setConfirming(null)}>
                          Cancel
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-muted">The company gets the {i.plan ?? "new"} plan for this period, and a suspended company is opened again if nothing else is overdue.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
