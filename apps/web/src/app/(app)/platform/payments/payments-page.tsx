"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { qs, useDebounced } from "@/lib/use-debounced";
import { usd, type PlatformInvoice } from "@/lib/platform";
import type { Page } from "@/lib/types";
import { ButtonLink, ErrorState, Loading, PageHeader, Pager, Pills, SearchBar, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { InvoiceChip } from "../owner-chips";

type Filter = "all" | "open" | "overdue" | "paid" | "void";

/** Prototype "Payments": every subscription invoice across companies. */
export function PaymentsPage() {
  return (
    <OwnerOnly>
      <Payments />
    </OwnerOnly>
  );
}

function Payments() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const list = useApi<Page<PlatformInvoice>>(`/platform/invoices${qs({ q: search, status: status === "all" ? "" : status, page, limit: 20 })}`);

  return (
    <>
      <PageHeader title="Payments" subtitle="All subscription payments across companies" actions={<ButtonLink href="/platform/pending">Pending payments</ButtonLink>} />
      <SearchBar
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Search company or invoice"
      />
      <Pills
        label="Status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: "all", label: "All" },
          { value: "open", label: "Waiting" },
          { value: "overdue", label: "Overdue" },
          { value: "paid", label: "Paid" },
          { value: "void", label: "Void" },
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={list.data.items}
            rowKey={(i) => i.id}
            empty="No invoices match"
            columns={[
              { header: "Date", className: "whitespace-nowrap", cell: (i) => fmtDate(i.paidAt ?? i.createdAt) },
              { header: "Company", className: "min-w-[160px]", cell: (i) => i.company.name },
              { header: "Plan", cell: (i) => i.plan ?? "—" },
              { header: "Amount", emphasis: true, className: "whitespace-nowrap", cell: (i) => usd(i.totalCents, i.currency) },
              { header: "Method", cell: (i) => i.paymentRef ?? "—" },
              { header: "Status", cell: (i) => <InvoiceChip invoice={i} /> },
              { header: "Invoice", className: "whitespace-nowrap", cell: (i) => i.number },
            ]}
          />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
