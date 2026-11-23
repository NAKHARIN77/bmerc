"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtDateTime } from "@/lib/format";
import { qs, useDebounced } from "@/lib/use-debounced";
import type { PlatformAuditRow, PlatformCompany } from "@/lib/platform";
import type { Page } from "@/lib/types";
import { ErrorState, Loading, PageHeader, Pager, SearchBar, Select, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";

// Prototype filter: All actions, Login, Job update, Stock change, Settings (+ platform owner actions and views).
const ACTIONS = [
  ["", "All actions"],
  ["auth.", "Login"],
  ["job.", "Job update"],
  ["stock.", "Stock change"],
  ["company.", "Settings"],
  ["user.", "Users"],
  ["platform.", "Platform owner"],
  ["view.", "Viewed data"],
] as const;

const LABEL: Record<string, string> = {
  "auth.login": "Login",
  "auth.login_failed": "Login failed",
  "auth.password_changed": "Password changed",
  "job.created": "Job received",
  "job.assigned": "Job assigned",
  "job.status_changed": "Job update",
  "stock.in": "Stock in",
  "stock.out": "Stock out",
  "stock.adjust": "Stock adjusted",
  "platform.company_suspended": "Company suspended",
  "platform.company_activated": "Company activated",
  "platform.limits_changed": "Limits changed",
  "platform.plan_changed": "Plan changed",
  "platform.invoice_paid": "Payment confirmed",
  "platform.payment_rejected": "Payment rejected",
};
const label = (a: string) => LABEL[a] ?? a.replace(/^view\./, "Viewed ").replace(/[._]/g, " ");

/** Owner "Audit log": who changed what, and when, across every company. */
export function AuditPage() {
  return (
    <OwnerOnly>
      <Audit />
    </OwnerOnly>
  );
}

function Audit() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const companies = useApi<PlatformCompany[]>("/platform/companies");
  const list = useApi<Page<PlatformAuditRow>>(`/platform/audit-logs${qs({ q: search, action, companyId, page, limit: 30 })}`);
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who changed what, and when, in every company" />
      <SearchBar
        value={q}
        onChange={(v) => {
          setQ(v);
          reset();
        }}
        placeholder="Search by action or target"
      >
        <div className="w-full sm:w-[180px]">
          <Select
            aria-label="Action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              reset();
            }}
          >
            {ACTIONS.map(([v, l]) => (
              <option key={l} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-[220px]">
          <Select
            aria-label="Company"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              reset();
            }}
          >
            <option value="">All companies</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </SearchBar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={list.data.items}
            rowKey={(r) => r.id}
            empty="No entries match"
            columns={[
              { header: "Time", className: "whitespace-nowrap", cell: (r) => fmtDateTime(r.createdAt) },
              { header: "User", cell: (r) => r.actor?.fullName ?? "—" },
              { header: "Company", cell: (r) => r.company?.name ?? "Platform" },
              { header: "Action", cell: (r) => label(r.action) },
              { header: "Target", cell: (r) => (r.entityType ? `${r.entityType}${r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}` : "—") },
              { header: "IP", cell: (r) => r.ip ?? "—" },
            ]}
          />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
