"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { JobDetail, RepairInvoice } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

type Line = { kind: "labor" | "part" | "other"; description: string; qty: string; unitPrice: string; jobPartId: string | null };
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const cents = (v: string) => Math.round(Number(v || 0) * 100);

/** Create or edit the job's repair invoice: labor, parts used on the job, other charges. */
export function InvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager");
  const job = useApi<JobDetail>(allowed ? `/jobs/${id}` : null);
  const existing = useApi<RepairInvoice>(allowed && job.data?.invoice ? `/job-invoices/${job.data.invoice.id}` : null);
  if (!allowed) return <NoAccess />;
  if (job.error) return <ErrorState error={job.error} onRetry={job.reload} />;
  if (!job.data || (job.data.invoice && !existing.data)) return <Loading />;
  return <Form job={job.data} invoice={existing.data ?? null} />;
}

function Form({ job: j, invoice }: { job: JobDetail; invoice: RepairInvoice | null }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() =>
    invoice
      ? invoice.lines.map((l) => ({ kind: l.kind, description: l.description, qty: String(l.qty), unitPrice: (l.unitPriceCents / 100).toString(), jobPartId: l.jobPartId }))
      : [
          { kind: "labor", description: `Repair labor, ${j.device.model}`, qty: "1", unitPrice: "", jobPartId: null },
          ...j.parts.map((p) => ({ kind: "part" as const, description: `${p.part.name} (${p.part.sku})`, qty: String(p.qty), unitPrice: "", jobPartId: p.id })),
        ],
  );
  const [dueDays, setDueDays] = useState("7");
  const [note, setNote] = useState(invoice?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, [k]: v } : l)));
  const currency = invoice?.currency;
  const subtotal = lines.reduce((a, l) => a + Math.round(Number(l.qty || 0) * cents(l.unitPrice)), 0);
  const back = invoice ? `/repair-invoices/${invoice.id}` : `/jobs/${j.id}`;

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      lines: lines.filter((l) => l.description.trim()).map((l) => ({ kind: l.kind, description: l.description.trim(), qty: Number(l.qty), unitPriceCents: cents(l.unitPrice), jobPartId: l.jobPartId })),
      dueDays: Number(dueDays),
      note: note.trim() || null,
    };
    try {
      const r = invoice
        ? await api<{ id: string }>(`/job-invoices/${invoice.id}`, { method: "PATCH", body })
        : await api<{ id: string }>(`/jobs/${j.id}/invoice`, { method: "POST", body });
      router.push(`/repair-invoices/${r.id}`);
    } catch (e) {
      const f = e instanceof ApiError ? Object.values(e.fieldErrors())[0] : null;
      setError(f ? `Check the lines: ${f}` : errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={invoice ? `Edit invoice ${invoice.number}` : `New invoice for ${j.number}`}
        subtitle={`${j.customer.name} · ${j.device.model} · ${j.device.serialNo}`}
        actions={
          <ButtonLink href={back} variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <Card>
        <p className="mb-3 text-[13px] text-muted">Prices are in your company&apos;s repair currency, before tax. Tax is added at the rate set in Company settings.</p>
        {lines.map((l, i) => (
          <div key={i} className="mb-3 grid gap-2 rounded-lg bg-[#f6f8ff] p-3 md:grid-cols-[120px_1fr_90px_140px_120px_auto] md:items-center">
            <Select aria-label="Kind" value={l.kind} onChange={(e) => set(i, "kind", e.target.value)}>
              <option value="labor">Labor</option>
              <option value="part">Part</option>
              <option value="other">Other</option>
            </Select>
            <Input aria-label="Description" value={l.description} onChange={(e) => set(i, "description", e.target.value)} placeholder="Description" />
            <Input aria-label="Quantity" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} />
            <Input aria-label="Unit price" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => set(i, "unitPrice", e.target.value)} placeholder="Unit price" />
            <span className="text-right text-sm font-semibold">{(Math.round(Number(l.qty || 0) * cents(l.unitPrice)) / 100).toFixed(2)}</span>
            <Button variant="ghost" className="h-8" onClick={() => setLines((x) => x.filter((_, n) => n !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => setLines((x) => [...x, { kind: "other", description: "", qty: "1", unitPrice: "", jobPartId: null }])}>
          + Add line
        </Button>
        <div className="mt-4 grid gap-x-4 sm:grid-cols-[160px_1fr]">
          <Field label="Due in (days)">{(fid) => <Input id={fid} type="number" min={0} max={365} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />}</Field>
          <Field label="Note on the invoice (optional)">{(fid) => <Textarea id={fid} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 30-day warranty on replaced boards" />}</Field>
        </div>
        <div className="flex items-center justify-between border-t border-soft pt-3">
          <span className="text-sm text-muted">Subtotal before tax: <b className="text-ink">{currency ? money(subtotal, currency) : (subtotal / 100).toFixed(2)}</b></span>
          <Button busy={busy} onClick={save} disabled={!lines.length}>
            {invoice ? "Save invoice" : "Issue invoice"}
          </Button>
        </div>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>
    </>
  );
}
