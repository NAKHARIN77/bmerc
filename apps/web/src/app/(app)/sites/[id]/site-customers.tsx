"use client";

import { DEVICE_KIND_LABEL } from "@bmerc/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { SiteCustomer } from "@/lib/types";
import { StatusChip } from "@/components/chips";
import { ButtonLink, Card, CellLink, ErrorState, Facts, Loading, SearchBar, Table } from "@/components/ui";

/** Site detail → Customers: who sent devices to this site, and every device and job they sent here. */
export function SiteCustomers({ siteId }: { siteId: string }) {
  const { can } = useSession();
  const router = useRouter();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const list = useApi<SiteCustomer[]>(allowed ? `/sites/${siteId}/customers` : null);
  const [q, setQ] = useState("");
  if (!allowed) return <Card className="text-muted">Your role cannot see customer details.</Card>;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;

  const needle = q.trim().toLowerCase();
  const shown = list.data.filter(
    (c) => !needle || [c.name, c.contactName, c.email, c.phone].some((v) => v?.toLowerCase().includes(needle)) || c.jobs.some((j) => j.device.serialNo.toLowerCase().includes(needle)),
  );

  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search customer, contact, email, phone or serial" />
      {list.data.length === 0 && <Card className="text-muted">No customer has sent a device to this site yet.</Card>}
      {list.data.length > 0 && shown.length === 0 && <Card className="text-muted">No customer matches this search.</Card>}
      {shown.map((c) => (
        <Card key={c.id} className="mb-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/customers/${c.id}`} className="text-base font-bold text-navy hover:underline">
                {c.name}
              </Link>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#eef1f8] px-2.5 py-1 text-xs font-semibold text-navy">
                  {c.devices} {c.devices === 1 ? "device" : "devices"} sent here
                </span>
                <span className="rounded-full bg-[#fef3c7] px-2.5 py-1 text-xs font-semibold text-warn">{c.openJobs} open</span>
                <span className="rounded-full bg-[#eef1f8] px-2.5 py-1 text-xs font-semibold text-navy">Last received {fmtDate(c.lastReceivedAt)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <ButtonLink href={`/customers/${c.id}`} variant="secondary" className="h-9">
                Customer detail
              </ButtonLink>
              <ButtonLink href={`/jobs/new?customer=${c.id}&site=${siteId}`} className="h-9">
                + Receive device
              </ButtonLink>
            </div>
          </div>
          <Facts
            cols={3}
            items={[
              ["Contact person", c.contactName ?? "—"],
              ["Email", c.email ?? "—"],
              ["Phone", c.phone ?? "—"],
            ]}
          />
          <div className="mt-4">
            <Table
              rows={c.jobs}
              rowKey={(j) => j.id}
              onRowClick={(j) => router.push(`/jobs/${j.id}`)}
              columns={[
                { header: "Ticket", className: "whitespace-nowrap", cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink> },
                { header: "Item", cell: (j) => DEVICE_KIND_LABEL[j.device.kind] },
                { header: "Model", className: "min-w-[150px]", cell: (j) => j.device.model },
                { header: "Serial", cell: (j) => j.device.serialNo },
                { header: "Fault", className: "min-w-[160px]", cell: (j) => j.reportedFault ?? "—" },
                { header: "Received", className: "whitespace-nowrap", cell: (j) => fmtDate(j.receivedAt) },
                { header: "Status", cell: (j) => <StatusChip status={j.status} /> },
              ]}
            />
          </div>
        </Card>
      ))}
    </>
  );
}
