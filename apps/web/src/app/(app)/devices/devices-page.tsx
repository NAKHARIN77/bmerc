"use client";

import { DEVICE_KIND_LABEL } from "@bmerc/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { DeviceMatch } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Button, ButtonLink, Card, CellLink, ErrorState, Input, Loading, PageHeader, Table } from "@/components/ui";

const PAY = { unpaid: "Unpaid", partial: "Part paid", paid: "Paid", void: "Void" } as const;
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/** Look up every job by the serial of a miner or a single board (boards repaired inside a miner show up too). */
export function DevicesPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const [text, setText] = useState("");
  const [serial, setSerial] = useState("");
  const found = useApi<DeviceMatch[]>(me.role && serial.length >= 2 ? `/devices/search?serial=${encodeURIComponent(serial)}` : null);
  if (!me.role) return <NoAccess />;

  return (
    <>
      <PageHeader
        title="Device repair history"
        subtitle="Look up every job by the serial of a miner or a single board. Boards repaired inside a miner show up too"
        actions={
          <>
            {can("company_admin", "site_manager", "head_technician") && <ButtonLink href="/jobs/new">Receive new device</ButtonLink>}
          </>
        }
      />
      <Card className="mb-4 max-w-[960px]">
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSerial(text.trim());
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Scan or type the serial of a miner or a board" aria-label="Serial number" autoFocus />
          <Button type="submit" disabled={text.trim().length < 2}>
            Search
          </Button>
        </form>
      </Card>
      {!serial ? null : found.error ? (
        <ErrorState error={found.error} onRetry={found.reload} />
      ) : !found.data ? (
        <Loading />
      ) : (
        <>
          {found.data.length > 0 && (
            <p className="mb-3 text-sm text-muted">
              {found.data.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && " · "}
                  <CellLink href={`/devices/${d.id}`}>
                    {DEVICE_KIND_LABEL[d.kind]} {d.serialNo}
                  </CellLink>{" "}
                  ({d.model}, {d.customer.name}
                  {d.matchedBoard ? `, board inside: ${d.matchedBoard}` : ""})
                </span>
              ))}
            </p>
          )}
          <Table
            rows={found.data.flatMap((d) => d.jobs.map((j) => ({ ...j, device: d })))}
            rowKey={(j) => j.id}
            onRowClick={(j) => router.push(`/jobs/${j.id}`)}
            empty="No device or board with this serial has been repaired here"
            columns={[
              { header: "Work Order", className: "whitespace-nowrap", cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink> },
              { header: "Date", className: "whitespace-nowrap", cell: (j) => fmtDate(j.receivedAt) },
              { header: "Fault", cell: (j) => j.reportedFault ?? "—" },
              { header: "Parts used", cell: (j) => (j.parts.length ? j.parts.map((p) => `${p.part.name} x${p.qty}`).join(", ") : "—") },
              { header: "Labor / parts cost", className: "whitespace-nowrap", cell: (j) => (j.invoice && j.invoice.status !== "void" ? money(j.invoice.totalCents, j.invoice.currency) : "Not billed") },
              { header: "Payment", cell: (j) => (j.invoice && j.invoice.status !== "void" ? PAY[j.invoice.status] : "—") },
            ]}
          />
        </>
      )}
    </>
  );
}
