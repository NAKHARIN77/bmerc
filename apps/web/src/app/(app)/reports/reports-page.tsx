"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, Card, ErrorState, Loading, PageHeader, Pills } from "@/components/ui";

export type Period = "day" | "week" | "month";
export const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
const TITLE: Record<Period, string> = {
  day: "Jobs completed per day (last 7 days)",
  week: "Jobs completed per week (last 4 weeks)",
  month: "Jobs completed per month (last 3 months)",
};
const CAPTION: Record<Period, string> = {
  day: "Each bar is one day. The number on top is jobs that passed QC.",
  week: "Each bar is one week (Monday to Sunday). The number on top is jobs that passed QC.",
  month: "Each bar is one month. The number on top is jobs that passed QC.",
};
const CARDS = [
  ["turnaround", "Repair turnaround time", "Average days from intake to release", "Period: day, week or month", "Includes: jobs released to customers, counted by release date"],
  ["parts-usage", "Parts usage by site", "Parts used in jobs per site this period", "Period: day, week or month", "Includes: parts taken from stock into jobs, minus parts returned"],
  ["jobs-by-technician", "Jobs by technician", "Completed and open jobs per technician", "Period: day, week or month", "Includes: jobs assigned to each technician; completed means passed QC"],
] as const;

/** Prototype "Reports" (company): three reports and the jobs-completed chart. */
export function ReportsPage() {
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const [period, setPeriod] = useState<Period>("week");
  const bars = useApi<Array<{ label: string; count: number }>>(allowed ? `/reports/completed?period=${period}` : null);
  if (!allowed) return <NoAccess />;
  const max = Math.max(1, ...(bars.data ?? []).map((b) => b.count));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Operational reports for the repair center"
        actions={
          <a href={`/api/v1/reports/completed?period=${period}&format=csv`} className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-navy">
            Export CSV
          </a>
        }
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {CARDS.map(([kind, t, d, p, i]) => (
          <Card key={kind}>
            <b className="text-base">{t}</b>
            <p className="mt-3 text-[15px] text-muted">{d}</p>
            <p className="mb-4 mt-3 text-[13px] text-muted">
              {p}
              <br />
              {i}
            </p>
            <ButtonLink href={`/reports/${kind}`} variant="secondary">
              Open
            </ButtonLink>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-base">{TITLE[period]}</b>
          <div className="-mb-4">
            <Pills label="Period" value={period} onChange={setPeriod} options={PERIODS} />
          </div>
        </div>
        <p className="mt-1 text-[13px] text-muted">{CAPTION[period]}</p>
        {bars.error ? (
          <ErrorState error={bars.error} onRetry={bars.reload} />
        ) : !bars.data ? (
          <Loading />
        ) : (
          <div className="mt-4 flex h-[220px] items-end gap-4">
            {bars.data.map((b) => (
              <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end">
                <b className="mb-1 text-sm">{b.count}</b>
                <div className="w-full rounded-t-md bg-info" style={{ height: `${Math.max(2, (b.count / max) * 160)}px` }} />
                <span className="mt-1.5 text-center text-xs text-muted">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
