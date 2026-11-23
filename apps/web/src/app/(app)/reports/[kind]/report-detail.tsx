"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, Card, ErrorState, Loading, PageHeader, Pills, Table } from "@/components/ui";
import { PERIODS, type Period } from "../reports-page";

type Kind = "turnaround" | "parts-usage" | "jobs-by-technician";
const META: Record<Kind, { title: string; note: string }> = {
  turnaround: { title: "Repair turnaround time", note: "Days from intake to release, for jobs returned to the customer in the period." },
  "parts-usage": { title: "Parts usage by site", note: "Parts taken from stock into jobs in the period, minus parts returned to stock." },
  "jobs-by-technician": { title: "Jobs by technician", note: "Completed means passed QC in the period; open means not yet at QC." },
};

interface Turnaround {
  periods: Array<{ label: string; released: number; avgDays: number | null }>;
  jobs: Array<{ number: string; model: string; site: string; receivedAt: string; releasedAt: string; days: number; repaired: boolean }>;
}
interface PartsUsage {
  rows: Array<{ site: string; part: string; sku: string; unit: string; used: number }>;
}
interface ByTech {
  rows: Array<{ name: string; completed: number; open: number }>;
}

/** Prototype "Report detail": one report as a table, with the period and Export CSV. */
export function ReportDetail() {
  const { kind } = useParams<{ kind: Kind }>();
  const { can } = useSession();
  const [period, setPeriod] = useState<Period>("month");
  const allowed = kind === "parts-usage" ? can("company_admin", "site_manager", "head_technician", "stock_keeper") : can("company_admin", "site_manager", "head_technician");
  const known = kind in META;
  const data = useApi<Turnaround | PartsUsage | ByTech>(allowed && known ? `/reports/${kind}?period=${period}` : null);
  if (!allowed || !known) return <NoAccess />;
  const m = META[kind];

  return (
    <>
      <PageHeader
        title={`Report: ${m.title}`}
        subtitle={m.note}
        actions={
          <>
            <ButtonLink href="/reports" variant="secondary">
              Back to reports
            </ButtonLink>
            <a href={`/api/v1/reports/${kind}?period=${period}&format=csv`} className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-navy">
              Export CSV
            </a>
          </>
        }
      />
      <Pills label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      {data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : !data.data ? (
        <Loading />
      ) : kind === "turnaround" ? (
        <>
          <Table
            rows={(data.data as Turnaround).periods}
            rowKey={(r) => r.label}
            columns={[
              { header: "Period", cell: (r) => r.label },
              { header: "Released", cell: (r) => r.released },
              { header: "Average days", cell: (r) => (r.avgDays === null ? "—" : r.avgDays) },
            ]}
          />
          <Card className="mt-4">
            <b className="text-base">Jobs released</b>
            <div className="mt-3">
              <Table
                rows={(data.data as Turnaround).jobs}
                rowKey={(r) => r.number}
                empty="No job was returned to a customer in this period"
                columns={[
                  { header: "Ticket", cell: (r) => r.number },
                  { header: "Model", cell: (r) => r.model },
                  { header: "Site", cell: (r) => r.site },
                  { header: "Received", cell: (r) => fmtDate(r.receivedAt) },
                  { header: "Released", cell: (r) => fmtDate(r.releasedAt) },
                  { header: "Days", cell: (r) => r.days },
                  { header: "Result", cell: (r) => (r.repaired ? "Repaired" : "Not repaired") },
                ]}
              />
            </div>
          </Card>
        </>
      ) : kind === "parts-usage" ? (
        <Table
          rows={(data.data as PartsUsage).rows}
          rowKey={(r) => `${r.site}:${r.sku}`}
          empty="No parts were used in jobs in this period"
          columns={[
            { header: "Site", cell: (r) => r.site },
            { header: "Part", cell: (r) => r.part },
            { header: "SKU", cell: (r) => r.sku },
            { header: "Used", cell: (r) => `${r.used} ${r.unit}` },
          ]}
        />
      ) : (
        <Table
          rows={(data.data as ByTech).rows}
          rowKey={(r) => r.name}
          empty="No jobs assigned in this period"
          columns={[
            { header: "Technician", cell: (r) => r.name },
            { header: "Completed", cell: (r) => r.completed },
            { header: "Open", cell: (r) => r.open },
          ]}
        />
      )}
    </>
  );
}
