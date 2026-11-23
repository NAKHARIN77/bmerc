"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { limitText, type PlatformCompany } from "@/lib/platform";
import { Alert, Button, ButtonLink, ErrorState, Loading, PageHeader, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { AccessChip, PaymentChip } from "../owner-chips";

/** Prototype "Quotas": plan, limits, usage, payment and access per company. A suspended company cannot use the system. */
export function QuotasPage() {
  return (
    <OwnerOnly>
      <Quotas />
    </OwnerOnly>
  );
}

function Quotas() {
  const list = useApi<PlatformCompany[]>("/platform/companies");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(c: PlatformCompany) {
    const suspend = c.status === "active";
    if (suspend && !window.confirm(`Suspend ${c.name}? Their staff will only see the Account suspended page until you activate them again. No data is deleted.`)) return;
    setBusy(c.id);
    setError(null);
    try {
      await api(`/platform/companies/${c.id}/${suspend ? "suspend" : "activate"}`, { method: "POST", body: {} });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Quotas" subtitle="Plan, limits and access for each company. A suspended company cannot use the system" />
      {error && <Alert>{error}</Alert>}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Table
          rows={list.data}
          rowKey={(c) => c.id}
          columns={[
            { header: "Company", className: "min-w-[170px]", cell: (c) => c.name },
            { header: "Plan", cell: (c) => (c.plan?.name ?? "—") + (c.hasOverride ? " *" : "") },
            { header: "Job orders (month)", className: "whitespace-nowrap", cell: (c) => limitText(c.usage.jobsThisMonth, c.limits.jobsPerMonth) },
            { header: "Sites", className: "whitespace-nowrap", cell: (c) => limitText(c.usage.sites, c.limits.sites) },
            { header: "Users", className: "whitespace-nowrap", cell: (c) => limitText(c.usage.users, c.limits.users) },
            { header: "Payment", cell: (c) => <PaymentChip payment={c.payment} /> },
            { header: "Access", cell: (c) => <AccessChip status={c.status} /> },
            {
              header: "Actions",
              className: "whitespace-nowrap",
              cell: (c) => (
                <div className="flex gap-2">
                  <ButtonLink href={`/platform/quotas/${c.id}`} variant="secondary" className="h-8">
                    View plan
                  </ButtonLink>
                  {c.status !== "closed" && (
                    <Button className="h-8" variant={c.status === "active" ? "secondary" : "primary"} busy={busy === c.id} onClick={() => toggle(c)}>
                      {c.status === "active" ? "Suspend" : "Activate"}
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
      <p className="mt-3 text-xs text-muted">* Limits changed for this company (override).</p>
    </>
  );
}
