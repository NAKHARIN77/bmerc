"use client";

import type { PlatformCompany, PlatformInvoice } from "@/lib/platform";
import { Chip } from "@/components/ui";

export const PaymentChip = ({ payment }: { payment: PlatformCompany["payment"] }) => (
  <Chip tone={payment === "Paid" ? "success" : payment === "Overdue" ? "danger" : payment === "Due" ? "warn" : "neutral"}>{payment}</Chip>
);

export const AccessChip = ({ status }: { status: PlatformCompany["status"] }) =>
  status === "active" ? <Chip tone="success">Active</Chip> : <Chip tone="danger">{status === "suspended" ? "Suspended" : "Closed"}</Chip>;

/** Invoice state: an open invoice past its due date shows as Overdue. */
export function InvoiceChip({ invoice: i }: { invoice: Pick<PlatformInvoice, "status" | "overdue"> }) {
  if (i.status === "paid") return <Chip tone="success">Paid</Chip>;
  if (i.status === "void") return <Chip tone="neutral">Void</Chip>;
  return i.overdue ? <Chip tone="danger">Overdue</Chip> : <Chip tone="warn">Waiting</Chip>;
}
