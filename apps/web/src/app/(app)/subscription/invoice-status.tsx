"use client";

import type { BillingInvoice } from "@/lib/billing";
import { Chip } from "@/components/ui";

export function InvoiceStatus({ invoice: i }: { invoice: Pick<BillingInvoice, "status" | "overdue" | "reported"> }) {
  if (i.status === "paid") return <Chip tone="success">Paid</Chip>;
  if (i.status === "void") return <Chip tone="neutral">Void</Chip>;
  if (i.reported) return <Chip tone="info">Waiting for confirmation</Chip>;
  return i.overdue ? <Chip tone="danger">Overdue</Chip> : <Chip tone="warn">To pay</Chip>;
}
