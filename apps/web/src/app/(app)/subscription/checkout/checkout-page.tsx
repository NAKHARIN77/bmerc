"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { money, vatText, type BillingSubscription } from "@/lib/billing";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, ErrorState, Facts, Loading, PageHeader } from "@/components/ui";

/** Prototype "Checkout": review the plan and billing details, then go on to payment. */
export function CheckoutPage() {
  const { can } = useSession();
  const router = useRouter();
  const planId = useSearchParams().get("plan");
  const allowed = can("company_admin");
  const sub = useApi<BillingSubscription>(allowed ? "/billing/subscription" : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;
  if (sub.error) return <ErrorState error={sub.error} onRetry={sub.reload} />;
  if (!sub.data) return <Loading />;
  const s = sub.data;
  const plan = s.plans.find((p) => p.id === planId);
  const back = (
    <ButtonLink href="/subscription" variant="secondary">
      Back to subscription
    </ButtonLink>
  );
  if (!plan) {
    return (
      <>
        <PageHeader title="Checkout" actions={back} />
        <Alert>This plan is not available. Choose a plan on the subscription page.</Alert>
      </>
    );
  }
  const vat = Math.round((plan.priceCents * s.vatBps) / 10_000);
  const c = s.company;

  async function next() {
    setBusy(true);
    setError(null);
    try {
      const inv = await api<{ id: string; voided?: string[] }>("/billing/checkout", { method: "POST", body: { planId: plan!.id } });
      const replaced = inv.voided?.length ? `?replaced=${encodeURIComponent(inv.voided.join(", "))}` : "";
      router.push(`/subscription/invoices/${inv.id}${replaced}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={`Checkout: ${plan.name} plan`} subtitle="Review your plan, then choose how to pay" actions={back} />
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <b className="text-base">Billing details</b>
          <ButtonLink href="/settings/company" variant="ghost">
            Edit
          </ButtonLink>
        </div>
        <div className="mt-4">
          <Facts
            items={[
              ["Company", c.legalName ?? c.name],
              ["Tax ID", c.taxId ?? "—"],
              ["Billing email", c.billingEmail ?? "—"],
              ["Billing address", c.billingAddress ?? "—"],
            ]}
          />
        </div>
      </Card>
      <Card className="max-w-[720px]">
        <b className="text-base">Order</b>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span>BMERC {plan.name} plan, 1 month</span>
            <span>{money(plan.priceCents, plan.currency)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>VAT {vatText(s.vatBps)}</span>
            <span>{money(vat, plan.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-soft pt-2 font-bold">
            <span>Total</span>
            <span>{money(plan.priceCents + vat, plan.currency)}</span>
          </div>
        </div>
        <p className="mt-4 leading-relaxed text-muted">
          Next you choose how to pay. The plan starts once the payment is confirmed
          {c.subscription && c.subscription.plan.id !== plan.id ? `; your ${c.subscription.plan.name} plan stays until then` : ""}.
        </p>
        {error && <Alert>{error}</Alert>}
        <Button className="mt-2 w-full" busy={busy} onClick={next}>
          Continue to payment
        </Button>
      </Card>
    </>
  );
}
