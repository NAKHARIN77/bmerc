"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { usd } from "@/lib/platform";
import { Card, ErrorState, Loading, PageHeader, Pills, Table, ButtonLink } from "@/components/ui";
import { OwnerOnly } from "../owner-only";

type Period = "day" | "week" | "month";
interface Reports {
  byPlan: Array<{ plan: string; companies: number; active: number; monthlyBilledCents: number }>;
  newCompanies: Array<{ label: string; count: number }>;
}

/** Owner "Reports": subscription revenue, companies by plan and new companies. */
export function ReportsPage() {
  return (
    <OwnerOnly>
      <ReportsView />
    </OwnerOnly>
  );
}

function ReportsView() {
  const [period, setPeriod] = useState<Period>("week");
  const r = useApi<Reports>(`/platform/reports?period=${period}`);
  const cards = [
    ["Subscription revenue", "Billed and collected per period", "Paid invoices by payment date; outstanding means overdue invoices", "/platform/revenue"],
    ["Companies by plan", "Number of companies on each plan", "As of today; monthly billed counts active companies only", "#by-plan"],
    ["New companies", "Companies that registered in the period", "Day, week or month; companies that finished registration", "#new"],
  ] as const;
  const max = Math.max(1, ...(r.data?.newCompanies.map((x) => x.count) ?? [1]));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Platform-wide reports across all companies"
        actions={
          <ButtonLink href="/platform/revenue" variant="secondary">
            Open revenue
          </ButtonLink>
        }
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {cards.map(([t, d, i, href]) => (
          <Card key={t}>
            <b className="text-base">{t}</b>
            <p className="mt-1 text-muted">{d}</p>
            <p className="mb-3 mt-1 text-xs text-muted">{i}</p>
            <Link href={href} className="inline-flex h-11 items-center rounded-lg bg-field px-4 text-sm font-semibold text-navy hover:bg-soft">
              Open
            </Link>
          </Card>
        ))}
      </div>
      {r.error ? (
        <ErrorState error={r.error} onRetry={r.reload} />
      ) : !r.data ? (
        <Loading />
      ) : (
        <>
          <Card className="mb-4">
            <b id="by-plan" className="text-base">
              Companies by plan (today)
            </b>
            <div className="mt-3">
              <Table
                rows={r.data.byPlan}
                rowKey={(p) => p.plan}
                columns={[
                  { header: "Plan", cell: (p) => p.plan },
                  { header: "Companies", cell: (p) => p.companies },
                  { header: "Active", cell: (p) => p.active },
                  { header: "Monthly billed", cell: (p) => usd(p.monthlyBilledCents) },
                ]}
              />
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b id="new" className="text-base">
                New companies
              </b>
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
            <div className="mt-4 flex h-[220px] items-end gap-4">
              {r.data.newCompanies.map((x) => (
                <div key={x.label} className="flex h-full flex-1 flex-col items-center justify-end">
                  <b className="mb-1 text-sm">{x.count}</b>
                  <div className="w-full rounded-t-md bg-info" style={{ height: `${Math.max(2, (x.count / max) * 160)}px` }} />
                  <span className="mt-1.5 text-center text-xs text-muted">{x.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
