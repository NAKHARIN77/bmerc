"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { CustomerDetail, JobRow, JobSummary, Page } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { StatusChip } from "@/components/chips";
import { Alert, Button, ButtonLink, Card, CellLink, ErrorState, Kpi, KpiRow, Loading, PageHeader, Table } from "@/components/ui";

export function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const router = useRouter();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const customer = useApi<CustomerDetail>(allowed ? `/customers/${id}` : null);
  const summary = useApi<JobSummary>(allowed ? `/jobs/summary?customerId=${id}` : null);
  const jobs = useApi<Page<JobRow>>(allowed ? `/jobs?customerId=${id}&limit=100` : null);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) return <NoAccess />;
  const back = (
    <ButtonLink href="/customers" variant="secondary">
      Back to customers
    </ButtonLink>
  );
  if (customer.error) {
    return (
      <>
        <PageHeader title="Customer" actions={back} />
        <ErrorState error={customer.error} onRetry={customer.reload} />
      </>
    );
  }
  if (!customer.data) return <Loading />;
  const c = customer.data;
  const canDelete = can("company_admin") && c.devices.length === 0;

  async function remove() {
    if (!window.confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try {
      await api(`/customers/${c.id}`, { method: "DELETE" });
      router.replace("/customers");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={["Customer", c.email, "Sends devices in; no login"].filter(Boolean).join(" · ")}
        actions={
          <>
            {back}
            {can("company_admin") && (
              <ButtonLink href={`/customers/${c.id}/edit`} variant="secondary">
                Edit customer
              </ButtonLink>
            )}
            {can("company_admin", "site_manager", "head_technician") && <ButtonLink href={`/jobs/new?customer=${c.id}`}>+ Receive device</ButtonLink>}
            {canDelete && (
              <Button variant="danger" onClick={remove}>
                Delete
              </Button>
            )}
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      <KpiRow>
        <Kpi label="Jobs" value={summary.data?.total ?? "—"} caption="All repair jobs" />
        <Kpi label="Open jobs" value={summary.data?.open ?? "—"} caption="Not yet passed QC" tone="warn" />
        <Kpi label="Country" value={c.country ?? "—"} caption="Customer location" tone="info" />
      </KpiRow>
      <Card className="mb-4">
        <b className="text-base">Contact</b>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <ContactItem label="Contact person">{c.contactName}</ContactItem>
          <ContactItem label="Phone">{c.phone && <a className="font-semibold text-info hover:underline" href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>{c.phone}</a>}</ContactItem>
          <ContactItem label="Email">{c.email && <a className="font-semibold text-info hover:underline" href={`mailto:${c.email}`}>{c.email}</a>}</ContactItem>
          <ContactItem label="Country">{c.country}</ContactItem>
        </dl>
      </Card>
      {jobs.error ? (
        <ErrorState error={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data ? (
        <Loading />
      ) : (
        <Table
          rows={jobs.data.items}
          rowKey={(j) => j.id}
          onRowClick={(j) => router.push(`/jobs/${j.id}`)}
          empty="No jobs for this customer that you can see"
          columns={[
            { header: "Ticket", className: "whitespace-nowrap", cell: (j) => <CellLink href={`/jobs/${j.id}`}>{j.number}</CellLink> },
            { header: "Device", cell: (j) => j.device.model },
            { header: "Received at site", cell: (j) => j.site.name },
            { header: "Status", className: "whitespace-nowrap", cell: (j) => <StatusChip status={j.status} /> },
            { header: "Technician", className: "whitespace-nowrap", cell: (j) => j.assignee?.fullName ?? "Unassigned" },
          ]}
        />
      )}
    </>
  );
}

function ContactItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children || "—"}</dd>
    </div>
  );
}
