"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { PartRequest } from "@/lib/types";
import { Button, Chip, Input } from "./ui";

const STATUS: Record<PartRequest["status"], React.ReactNode> = {
  pending: <Chip tone="warn">Waiting</Chip>,
  approved: <Chip tone="success">Given</Chip>,
  rejected: <Chip tone="danger">Rejected</Chip>,
  cancelled: <Chip tone="neutral">Cancelled</Chip>,
};

/**
 * Part requests as rows. Deciders get Give parts / Reject (with a reason) on waiting requests;
 * the person who asked gets Cancel.
 */
export function RequestList({
  rows,
  busy,
  run,
  showJob = true,
}: {
  rows: PartRequest[];
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<boolean>;
  showJob?: boolean;
}) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <ul className="divide-y divide-soft overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      {rows.map((r) => {
        const short = r.status === "pending" && r.inStock < r.qty;
        return (
          <li key={r.id} className="px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[15px]">
                    {r.qty} {r.part.unit} · {r.part.name}
                  </b>
                  {STATUS[r.status]}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted">
                  {showJob && (
                    <span>
                      Job{" "}
                      <Link href={`/jobs/${r.job.id}`} className="font-semibold text-info hover:underline">
                        {r.job.number}
                      </Link>{" "}
                      · {r.job.device.model}
                    </span>
                  )}
                  <span>
                    Asked by <span className="text-ink">{r.requestedBy ?? "—"}</span> · {fmtDateTime(r.createdAt)}
                  </span>
                  {showJob && <span>{r.site.name}</span>}
                  {r.status === "pending" && (
                    <span className={short ? "font-semibold text-danger" : ""}>
                      {r.inStock} in stock{short ? " — not enough" : ""}
                    </span>
                  )}
                </div>
                {r.note && <div className="mt-1 text-[13px]">“{r.note}”</div>}
                {r.status !== "pending" && r.decidedBy && (
                  <div className="mt-1 text-[13px] text-muted">
                    {r.status === "approved" ? "Given" : r.status === "rejected" ? "Rejected" : "Cancelled"} by {r.decidedBy} · {fmtDateTime(r.decidedAt)}
                    {r.decisionNote && <> · {r.decisionNote}</>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {r.canDecide && (
                  <>
                    <Button className="h-9 !bg-success hover:!bg-[#0b6b4f]" icon="check" busy={busy === r.id} disabled={short} title={short ? "Not enough in stock: stock in first, or reject" : "Take the parts out of stock and put them on the job"} onClick={() => run(r.id, () => api(`/part-requests/${r.id}/approve`, { method: "POST" }))}>
                      Give parts
                    </Button>
                    <Button className="h-9" variant="secondary" onClick={() => (setRejecting(rejecting === r.id ? null : r.id), setReason(""))}>
                      Reject
                    </Button>
                  </>
                )}
                {r.canCancel && (
                  <Button className="h-9" variant="secondary" busy={busy === `c${r.id}`} onClick={() => run(`c${r.id}`, () => api(`/part-requests/${r.id}/cancel`, { method: "POST" }))}>
                    Cancel request
                  </Button>
                )}
              </div>
            </div>
            {rejecting === r.id && (
              <form
                className="mt-3 flex flex-wrap gap-2 rounded-lg bg-[#f5f8ff] p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(`r${r.id}`, () => api(`/part-requests/${r.id}/reject`, { method: "POST", body: { reason: reason.trim() } }))) setRejecting(null);
                }}
              >
                <label htmlFor={`reason-${r.id}`} className="sr-only">
                  Why reject?
                </label>
                <Input id={`reason-${r.id}`} className="min-w-[200px] flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? e.g. out of stock, order placed" autoFocus />
                <Button type="submit" variant="danger" icon="close" busy={busy === `r${r.id}`} disabled={reason.trim().length < 3}>
                  Reject request
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
