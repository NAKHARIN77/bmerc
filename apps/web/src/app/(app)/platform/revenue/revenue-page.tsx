"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { usd, type PlatformCompany, type PlatformOverview } from "@/lib/platform";
import { ErrorState, Kpi, KpiRow, Loading, PageHeader, Pills, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { AccessChip, PaymentChip } from "../owner-chips";

type Period = "day" | "week" | "month";
interface Revenue {
  currency: string;
  rows: Array<{ label: string; billedCents: number; collectedCents: number; outstandingCents: number }>;
}
const TITLE: Record<Period, string> = { day: "Last 7 days", week: "Last 4 weeks", month: "Last 3 months" };

/** Prototype "Monthly revenue": subscription income by period and by company. */
export function RevenuePage() {
  return (
    <OwnerOnly>
      <RevenueView />
    </OwnerOnly>
  );
}

function RevenueView() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const revenue = useApi<Revenue>(`/platform/revenue?period=${period}`);
  const overview = useApi<PlatformOverview>("/platform/overview");
  const companies = useApi<PlatformCompany[]>("/platform/companies");
  const o = overview.data;
  const paying = (companies.data ?? []).filter((c) => c.payment === "Paid" && (c.plan?.priceCents ?? 0) > 0).length;

  return (
    <>
      <PageHeader title="Monthly revenue" subtitle="Subscription income by period. Amounts include VAT where it was charged" />
      <KpiRow>
        <Kpi label="Collected (this month)" value={o ? usd(o.collectedThisMonthCents) : "—"} caption="Paid subscriptions" tone="success" icon="dollar" />
        <Kpi label="Outstanding" value={o ? usd(o.outstandingCents) : "—"} caption="Overdue invoices" tone="danger" icon="dollar" />
        <Kpi label="Paying companies" value={companies.data ? paying : "—"} caption="On a paid plan" icon="building" />
      </KpiRow>
      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <b className="text-base">{TITLE[period]}</b>
        <div className="-mb-4">
          <Pills
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        </div>
      </div>
      {revenue.error ? (
        <ErrorState error={revenue.error} onRetry={revenue.reload} />
      ) : !revenue.data ? (
        <Loading />
      ) : (
        <Table
          rows={revenue.data.rows}
          rowKey={(r) => r.label}
          columns={[
            { header: "Period", cell: (r) => r.label },
            { header: "Billed", cell: (r) => usd(r.billedCents) },
            { header: "Collected", cell: (r) => usd(r.collectedCents) },
            { header: "Outstanding", cell: (r) => usd(r.outstandingCents) },
          ]}
        />
      )}
      <b className="mb-3 mt-6 block text-base">This month by company</b>
      {companies.error ? (
        <ErrorState error={companies.error} onRetry={companies.reload} />
      ) : !companies.data ? (
        <Loading />
      ) : (
        <Table
          rows={companies.data}
          rowKey={(c) => c.id}
          onRowClick={() => router.push("/platform/quotas")}
          columns={[
            { header: "Company", cell: (c) => c.name },
            { header: "Plan", cell: (c) => c.plan?.name ?? "—" },
            { header: "Price / month", cell: (c) => usd(c.plan?.priceCents ?? 0) },
            { header: "Payment", cell: (c) => <PaymentChip payment={c.payment} /> },
            { header: "Access", cell: (c) => <AccessChip status={c.status} /> },
          ]}
        />
      )}
    </>
  );
}
