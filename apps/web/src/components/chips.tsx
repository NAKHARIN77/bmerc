"use client";

import { JOB_STATUS_LABEL, SITE_STATUS_LABEL, type JobPriority, type JobStatus, type SiteStatus } from "@bmerc/shared";
import { Chip } from "./ui";

const STATUS_TONE: Record<JobStatus, "info" | "success" | "warn" | "danger" | "neutral"> = {
  todo: "info",
  in_repair: "success",
  waiting_parts: "warn",
  unrepairable: "danger",
  qc_passed: "neutral",
  dispatched: "neutral",
};

export const StatusChip = ({ status }: { status: JobStatus }) => <Chip tone={STATUS_TONE[status]}>{JOB_STATUS_LABEL[status]}</Chip>;

/** Only high and urgent stand out; normal and low show as plain text. */
export function PriorityChip({ priority }: { priority: JobPriority }) {
  if (priority === "urgent") return <Chip tone="danger">Urgent</Chip>;
  if (priority === "high") return <Chip tone="warn">High</Chip>;
  return <span className="text-sm text-muted">{priority === "low" ? "Low" : "Normal"}</span>;
}

export function SiteStatusChip({ status }: { status: SiteStatus }) {
  return <Chip tone={status === "active" ? "success" : status === "setup" ? "info" : "neutral"}>{SITE_STATUS_LABEL[status]}</Chip>;
}
