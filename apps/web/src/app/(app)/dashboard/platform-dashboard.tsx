"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { usd, type PlatformCompany, type PlatformOverview } from "@/lib/platform";
import { Card, Chip, ErrorState, Kpi, Loading, PageHeader, Table, ButtonLink } from "@/components/ui";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const accessChip = (status: PlatformCompany["status"]) =>
  status === "active" ? <Chip tone="success">Active</Chip> : status === "suspended" ? <Chip tone="danger">Suspended</Chip> : <Chip tone="neutral">Closed</Chip>;

/** Platform owner home (prototype "Platform dashboard (new)"): all companies combined. */
export function PlatformDashboard() {
  const router = useRouter();
  const overview = useApi<PlatformOverview>("/platform/overview");
  const companies = useApi<PlatformCompany[]>("/platform/companies");
  if (overview.error || companies.error) return <ErrorState error={(overview.error ?? companies.error)!} onRetry={() => (overview.reload(), companies.reload())} />;
  if (!overview.data || !companies.data) return <Loading />;
  const o = overview.data;
  const list = companies.data;
  const active = o.companies.active ?? 0;
  const suspended = o.companies.suspended ?? 0;
  const attention = list.filter((c) => c.payment === "Overdue" || c.payment === "Due" || c.status !== "active");

  // Revenue line (prototype: six months, points on a 600 × 200 box).
  const max = Math.max(1, ...o.revenue.map((r) => r.collectedCents));
  const pts = o.revenue.map((r, i) => [40 + i * 104, 170 - (r.collectedCents / max) * 140] as const);

  // Job status donut: open (to do), in progress (repair + waiting), completed (QC).
  const s = o.jobs.byStatus;
  const all = Object.values(s).reduce<number>((a, n) => a + (n ?? 0), 0);
  const pct = (n: number) => (all ? Math.round((n * 100) / all) : 0);
  const openPct = pct(s.todo ?? 0);
  const progPct = pct((s.in_repair ?? 0) + (s.waiting_parts ?? 0));
  const donePct = all ? Math.max(0, 100 - openPct - progPct) : 0;

  return (
    <>
      <PageHeader title="Platform overview" subtitle="All companies combined. Open a company to see its sites" />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Companies" value={list.length} caption={`${active} active, ${suspended} suspended`} icon="building" />
        <Kpi label="Open jobs" value={o.jobs.open} caption="Across all companies" tone="info" icon="wrench" />
        <Kpi label="Low stock" value={o.lowStock} caption="Site stock below minimum" tone="danger" icon="box" />
        <Kpi label="Pending payments" value={o.pendingPayments} caption="Waiting to confirm" tone="warn" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <b className="text-base">Companies</b>
        <ButtonLink href="/register" variant="secondary" className="h-9">
          + Add company
        </ButtonLink>
      </div>
      <Table
        rows={list}
        rowKey={(c) => c.id}
        onRowClick={(c) => router.push(`/platform/companies/${c.id}`)}
        columns={[
          { header: "Company", cell: (c) => <Link className="font-semibold text-info" href={`/platform/companies/${c.id}`}>{c.name}</Link> },
          { header: "Plan", cell: (c) => c.plan?.name ?? "—" },
          { header: "Status", cell: (c) => accessChip(c.status) },
          { header: "Sites", cell: (c) => c.sites },
          { header: "Open jobs", cell: (c) => c.jobs.open },
          { header: "Waiting parts", cell: (c) => c.jobs.waitingParts },
          { header: "Cannot repair", cell: (c) => c.jobs.cannotRepair },
          {
            header: "",
            className: "text-right",
            cell: (c) => (
              <ButtonLink href={`/platform/companies/${c.id}`} variant="secondary" className="h-8">
                View sites
              </ButtonLink>
            ),
          },
        ]}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-[#eef1f8] p-4">
          <div className="flex items-center justify-between">
            <b className="text-base">Needs attention</b>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy">{attention.length}</span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {attention.length === 0 && <Card className="text-sm text-muted">Nothing needs attention right now.</Card>}
            {attention.map((c) => (
              <Link key={c.id} href="/platform/quotas" className="flex items-center justify-between rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.05)] hover:shadow-[0_4px_14px_rgba(0,99,152,.2)]">
                <div>
                  <b>{c.name}</b>
                  <div className="text-xs text-muted">
                    Payment: {c.payment} · Plan: {c.plan?.name ?? "—"}
                  </div>
                </div>
                {c.status === "suspended" ? <Chip tone="danger">Suspended</Chip> : <Chip tone={c.payment === "Overdue" ? "danger" : "warn"}>{c.payment}</Chip>}
              </Link>
            ))}
          </div>
        </div>
        <Link href="/platform/revenue" className="block rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.05)] hover:shadow-[0_4px_14px_rgba(0,99,152,.2)]">
          <div className="flex items-center justify-between">
            <b className="text-base">Revenue</b>
            <span className="font-semibold text-success">{usd(o.collectedThisMonthCents)} this month</span>
          </div>
          <svg viewBox="0 0 600 200" className="h-[220px] w-full" role="img" aria-label="Collected revenue, last six months">
            <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#006398" strokeWidth={3} />
            {pts.map(([x, y], i) => (
              <g key={o.revenue[i].month}>
                <circle cx={x} cy={y} r={4} fill="#006398">
                  <title>{usd(o.revenue[i].collectedCents)}</title>
                </circle>
                <text x={x} y={192} textAnchor="middle" fontSize={12} fill="#43474e">
                  {MONTH.format(new Date(`${o.revenue[i].month}-01T00:00:00Z`))}
                </text>
              </g>
            ))}
          </svg>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <b className="text-base">Companies overview</b>
          <div className="mt-3">
            <Table
              rows={list}
              rowKey={(c) => c.id}
              onRowClick={(c) => router.push(`/platform/companies/${c.id}`)}
              columns={[
                { header: "Company", cell: (c) => c.name },
                { header: "Sites", cell: (c) => c.sites },
                { header: "Users", cell: (c) => c.usage.users },
                { header: "Open jobs", cell: (c) => c.jobs.open },
                { header: "Low stock", cell: (c) => c.lowStock },
                { header: "Status", cell: (c) => accessChip(c.status) },
              ]}
            />
          </div>
        </div>
        <Card>
          <b className="text-base">Job status</b>
          <div
            className="mx-auto my-4 flex h-40 w-40 items-center justify-center rounded-full"
            style={{ background: all ? `conic-gradient(#006398 0 ${openPct}%, #047857 ${openPct}% ${openPct + progPct}%, #c4c9d4 ${openPct + progPct}% 100%)` : "#eef1f8" }}
          >
            <div className="flex h-[100px] w-[100px] items-center justify-center rounded-full bg-white font-bold text-navy">{all} jobs</div>
          </div>
          <div className="text-[13px] leading-loose">
            <span className="text-info">●</span> Open {openPct}%
            <br />
            <span className="text-success">●</span> In progress {progPct}%
            <br />
            <span className="text-[#8a8f9a]">●</span> Completed {donePct}%
          </div>
          <p className="mt-2 text-xs text-muted">Counts only. The platform owner cannot open repair jobs.</p>
        </Card>
      </div>
    </>
  );
}
