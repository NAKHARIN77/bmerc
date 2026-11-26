"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { money, vatText, type BillingInvoice } from "@/lib/billing";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, ErrorState, Facts, Input, Loading, PageHeader, Table } from "@/components/ui";
import { InvoiceStatus } from "../../invoice-status";

/**
 * One plan invoice. Open: prototype "Choose a payment method". Paid: prototype "Receipt".
 * Card: Stripe Checkout (Stripe's own page), confirmed by Stripe's webhook. Bank transfer: reported here and
 * confirmed by BMERC. PayPal and Bitcoin are not connected yet.
 */
export function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const allowed = can("company_admin");
  const inv = useApi<BillingInvoice>(allowed ? `/billing/invoices/${id}` : null);
  if (!allowed) return <NoAccess />;
  if (inv.error) return <ErrorState error={inv.error} onRetry={inv.reload} />;
  if (!inv.data) return <Loading />;
  return inv.data.status === "paid" ? <Receipt i={inv.data} /> : <Pay i={inv.data} reload={inv.reload} />;
}

/** Back from Stripe: the webhook usually lands within seconds, so check again for up to a minute. */
function useConfirmingCard(open: boolean, reload: () => void) {
  const returned = useSearchParams().get("card") === "done";
  const [tries, setTries] = useState(0);
  const waiting = returned && open && tries < 20;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      reload();
    }, 3000);
    return () => clearTimeout(t);
  }, [waiting, tries, reload]);
  return { returned, waiting };
}

function Pay({ i, reload }: { i: BillingInvoice; reload: () => void }) {
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = useConfirmingCard(i.status === "open", reload);
  const replaced = useSearchParams().get("replaced");

  async function payByCard() {
    setCardBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(`/billing/invoices/${i.id}/pay-card`, { method: "POST" });
      window.location.href = url; // Stripe's payment page; it sends the person back here afterwards
    } catch (e) {
      setError(errorMessage(e));
      setCardBusy(false);
    }
  }
  const back = (
    <ButtonLink href="/subscription" variant="secondary">
      Back to subscription
    </ButtonLink>
  );

  async function notify() {
    setBusy(true);
    setError(null);
    try {
      await api(`/billing/invoices/${i.id}/notify`, { method: "POST", body: { method: "bank_transfer", reference: ref.trim() } });
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Choose a payment method" subtitle={`Invoice ${i.number} · ${i.plan?.name ?? ""} plan · ${money(i.totalCents, i.currency)}`} actions={back} />
      {replaced && i.status === "open" && (
        <div className="mb-4 max-w-[720px]">
          <Alert tone="neutral">Your earlier unpaid plan invoice ({replaced}) was cancelled, so you only pay this one.</Alert>
        </div>
      )}
      {card.returned && i.status === "open" && (
        <div className="mb-4 max-w-[720px]">
          <Alert tone="neutral">
            {card.waiting
              ? "Thank you. Stripe is confirming your card payment; this page updates by itself in a few seconds."
              : "We have not received Stripe's confirmation yet. If your card was charged, the invoice updates shortly; you can also contact BMERC."}
          </Alert>
        </div>
      )}
      {i.status === "void" ? (
        <Alert tone="neutral">This invoice was cancelled. Choose a plan again on the subscription page.</Alert>
      ) : i.reported ? (
        <Card className="max-w-[720px]">
          <b className="text-base">Payment reported</b>
          <p className="mt-2 leading-relaxed text-muted">
            You reported this payment ({i.paymentRef}). BMERC checks it and confirms; the plan starts then. You do not need to do anything else.
          </p>
          <div className="mt-3">
            <InvoiceStatus invoice={i} />
          </div>
        </Card>
      ) : (
        <>
          {error && (
            <div className="mb-4 max-w-[720px]">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className={i.cardPayments ? "" : "opacity-70"}>
              <b className="text-base">Credit or debit card</b>
              <p className="mb-4 mt-2 leading-relaxed text-muted">Pay {money(i.totalCents, i.currency)} on Stripe&apos;s secure page. Your plan starts as soon as the payment goes through.</p>
              <Button className="w-full" icon="lock" busy={cardBusy} disabled={!i.cardPayments} onClick={payByCard}>
                {i.cardPayments ? "Pay by card" : "Available soon"}
              </Button>
            </Card>
            {[
              ["PayPal", "Log in to PayPal or use a linked card"],
              ["Bitcoin (crypto)", "Send a supported coin to a wallet address"],
            ].map(([t, d]) => (
              <Card key={t} className="opacity-70">
                <b className="text-base">{t}</b>
                <p className="mb-4 mt-2 leading-relaxed text-muted">{d}</p>
                <Button className="w-full" disabled>
                  Available soon
                </Button>
              </Card>
            ))}
          </div>
          <Card className="mt-4 max-w-[720px]">
            <b className="text-base">Bank transfer</b>
            <p className="mt-2 leading-relaxed text-muted">
              Transfer <b className="text-ink">{money(i.totalCents, i.currency)}</b> and write <b className="text-ink">{i.number}</b> as the payment note. Then enter the bank
              reference below. BMERC confirms the payment and your plan starts.
            </p>
            <p className="mt-2 text-xs text-muted">BMERC&apos;s bank account details are shown on the invoice email (email sending is being set up).</p>
            <label htmlFor="ref" className="mb-1.5 mt-4 block text-xs font-medium text-muted">
              Bank reference or transfer slip number
            </label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. KBank 2026-11-23 10:42 ref 8812" />
            <div className="mt-3 flex justify-end">
              <Button busy={busy} disabled={ref.trim().length < 3} onClick={notify}>
                I have sent the payment
              </Button>
            </div>
          </Card>
        </>
      )}
      <Card className="mt-4 max-w-[720px]">
        <Facts
          items={[
            ["Invoice", i.number],
            ["Due", fmtDate(i.dueAt)],
            ["Plan", i.plan?.name ?? "—"],
            ["Amount", `${money(i.amountCents, i.currency)} + VAT ${vatText(i.taxRateBps)} = ${money(i.totalCents, i.currency)}`],
          ]}
        />
      </Card>
    </>
  );
}

function Receipt({ i }: { i: BillingInvoice }) {
  const c = i.company!;
  return (
    <>
      <style>{`@media print { aside, header, .no-print { display: none !important; } main { margin: 0 !important; padding: 0 !important; } }`}</style>
      <PageHeader
        title={`Receipt ${i.number}`}
        subtitle={`${c.name} · Paid`}
        actions={
          <span className="no-print flex gap-2.5">
            <ButtonLink href="/subscription" variant="secondary">
              Back
            </ButtonLink>
            <Button onClick={() => window.print()}>Print</Button>
          </span>
        }
      />
      <Card className="mb-4">
        <Facts
          items={[
            ["Bill to", c.legalName ?? c.name],
            ["Tax ID", c.taxId ?? "—"],
            ["Billing email", c.billingEmail ?? "—"],
            ["Payment method", i.paymentRef ?? "—"],
            ["Paid on", fmtDateTime(i.paidAt)],
            ["Billing address", c.billingAddress ?? "—"],
          ]}
        />
      </Card>
      <Table
        variant="table"
        rows={[i]}
        rowKey={(x) => x.id}
        columns={[
          { header: "Item", cell: (x) => `BMERC ${x.plan?.name ?? ""} plan` },
          { header: "Period", cell: (x) => `${fmtDate(x.periodStart)} – ${fmtDate(x.periodEnd)}` },
          { header: "Amount", cell: (x) => money(x.amountCents, x.currency) },
          { header: "Status", cell: (x) => <InvoiceStatus invoice={x} /> },
        ]}
      />
      <Card className="ml-auto mt-4 max-w-[360px] text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(i.amountCents, i.currency)}</span>
        </div>
        <div className="mt-1 flex justify-between text-muted">
          <span>VAT {vatText(i.taxRateBps)}</span>
          <span>{money(i.taxCents, i.currency)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-soft pt-2 font-bold">
          <span>Total paid</span>
          <span>{money(i.totalCents, i.currency)}</span>
        </div>
      </Card>
      <p className="mt-4 text-xs text-muted">This is a receipt, not a tax invoice.</p>
    </>
  );
}
