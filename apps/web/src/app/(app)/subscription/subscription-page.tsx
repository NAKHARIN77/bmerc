"use client";

import { WORK_TYPES, WORK_TYPE_LABEL } from "@bmerc/shared";

import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { money, vatText, type BillingInvoice, type BillingSubscription } from "@/lib/billing";
import { NoAccess } from "@/components/app-shell";
import { Alert, ButtonLink, Card, CellLink, ErrorState, Loading, PageHeader, Table } from "@/components/ui";
import { InvoiceStatus } from "./invoice-status";

/** Prototype "Subscription": current plan and usage, the plans on offer, and invoices. */
export function SubscriptionPage() {
  const { can } = useSession();
  const allowed = can("company_admin");
  const sub = useApi<BillingSubscription>(allowed ? "/billing/subscription" : null);
  const invoices = useApi<BillingInvoice[]>(allowed ? "/billing/invoices" : null);
  if (!allowed) return <NoAccess />;
  if (sub.error) return <ErrorState error={sub.error} onRetry={sub.reload} />;
  if (!sub.data) return <Loading />;
  const s = sub.data;
  const current = s.company.subscription;
  const jobs = s.usage.creditsThisMonth;
  const pct = jobs.limit ? Math.min(100, Math.round((jobs.used * 100) / jobs.limit)) : 0;
  const open = (invoices.data ?? []).filter((i) => i.status === "open");

  return (
    <>
      <PageHeader
        title="Subscription"
        subtitle="Choose the package that fits your repair center"
        actions={
          <ButtonLink href="/settings/company" variant="secondary">
            Payment details
          </ButtonLink>
        }
      />
      {s.company.status === "suspended" && <Alert>Your account is suspended. Pay the open invoice below to use the system again.</Alert>}
      {open.map((i) => (
        <Alert key={i.id} tone={i.overdue ? "danger" : "warn"}>
          Invoice {i.number} for {money(i.totalCents, i.currency)} is {i.overdue ? "overdue" : `due on ${fmtDate(i.dueAt)}`}
          {i.reported ? ". Your payment has been reported and is waiting for confirmation." : ". "}
          {!i.reported && (
            <CellLink href={`/subscription/invoices/${i.id}`}>Pay now</CellLink>
          )}
        </Alert>
      ))}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-base">Current plan: {current?.plan.name ?? "None"}</b>
          <span className="text-muted">
            Credits used this month: {jobs.used} {jobs.limit === null ? "(no limit)" : `of ${jobs.limit}`}
            {current && ` · Paid until ${fmtDate(current.currentPeriodEnd)}`}
          </span>
        </div>
        {jobs.limit !== null && (
          <div className="mt-2.5 h-2 rounded bg-[#eef1f8]">
            <div className={`h-2 rounded ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-info"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {s.plans.map((p) => {
          const isCurrent = current?.plan.id === p.id;
          return (
            <div key={p.id} className="flex flex-col rounded-xl border border-soft bg-white p-6">
              <b className="text-lg">{p.name}</b>
              <div className="my-2 text-[28px] font-bold">{money(p.priceCents, p.currency)} / month</div>
              {s.vatBps > 0 && <div className="-mt-1 mb-2 text-xs text-muted">plus VAT {vatText(s.vatBps)}</div>}
              <ul className="mb-4 flex-1 list-disc pl-[18px] leading-[1.9] text-muted">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="mb-4 rounded-lg bg-[#f5f8ff] px-3.5 py-2.5 text-[13px]">
                <b className="text-ink">{p.maxJobsPerMonth === null ? "Unlimited credits" : `${p.maxJobsPerMonth} credits per month`}</b>
                <div className="mt-0.5 text-muted">
                  Credits per job: {WORK_TYPES.map((t) => `${WORK_TYPE_LABEL[t].toLowerCase()} ${(isCurrent ? s.creditWeights : p.creditWeights)[t]}`).join(" · ")}
                </div>
                <div className="mt-0.5 text-xs text-muted">Used when a job passes QC. Cannot-repair jobs are free; the same device again within 7 days counts once.{isCurrent ? " These are the weights you bought." : ""}</div>
              </div>
              <ButtonLink href={`/subscription/checkout?plan=${p.id}`} variant={isCurrent ? "primary" : "secondary"} className="w-full">
                {isCurrent ? "Renew plan" : `Choose ${p.name}`}
              </ButtonLink>
            </div>
          );
        })}
      </div>
      <Card className="mt-4">
        <b className="text-base">Included in all plans</b>
        <ul className="mt-2 list-disc pl-[18px] leading-[1.9] text-muted">
          <li>Scanner and repair history per device, so technicians can see past repairs for returning customers</li>
          <li>Job status board: Completed, Cannot repair, In repair, and who took the job</li>
          <li>Stock per site, deducted when parts are used in a job</li>
        </ul>
      </Card>
      <b className="mb-3 mt-6 block text-base">Invoices</b>
      {invoices.error ? (
        <ErrorState error={invoices.error} onRetry={invoices.reload} />
      ) : !invoices.data ? (
        <Loading />
      ) : (
        <Table
          rows={invoices.data}
          rowKey={(i) => i.id}
          empty="No invoices yet"
          columns={[
            { header: "Invoice", cell: (i) => <CellLink href={`/subscription/invoices/${i.id}`}>{i.number}</CellLink> },
            { header: "Date", cell: (i) => fmtDate(i.createdAt) },
            { header: "Plan", cell: (i) => i.plan?.name ?? "—" },
            { header: "Amount", emphasis: true, cell: (i) => money(i.totalCents, i.currency) },
            { header: "Status", cell: (i) => <InvoiceStatus invoice={i} /> },
          ]}
        />
      )}
    </>
  );
}
