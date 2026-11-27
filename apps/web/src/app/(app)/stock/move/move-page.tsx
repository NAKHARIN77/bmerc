"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { qs } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { JobRow, MinerModel, Page, PartRow, Site, StockPage } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, ButtonLink, Field, FormCard, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

type Mode = "in" | "out" | "adjust";
const TEXT: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  in: { title: "Stock in", subtitle: "Record spare parts received at a site", submit: "Save stock in" },
  out: { title: "Stock out", subtitle: "Use parts in a repair job, or write off damaged parts", submit: "Save stock out" },
  adjust: { title: "Adjust stock", subtitle: "Correct the count after a physical check. A reason is required", submit: "Save adjustment" },
};

/** /stock/move?type=in|out|adjust — one form for the three ledger operations (prototype: Stock in, Stock out, Adjust stock). */
export function MovePage() {
  // A fresh start on every visit by link, so a part just added or edited (?part=) shows up and is picked.
  const { bfcacheId } = useRouter();
  return <MoveLoader key={bfcacheId} />;
}

function MoveLoader() {
  const { can } = useSession();
  const params = useSearchParams();
  const t = params.get("type");
  const mode: Mode = t === "out" || t === "adjust" ? t : "in";
  const allowed = can("company_admin", "site_manager", "stock_keeper");
  const parts = useApi<Page<PartRow>>(allowed ? "/parts?limit=100" : null);
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  if (!allowed) return <NoAccess />;
  if (!parts.data || !sites.data) return <Loading />;
  return (
    <MoveForm key={mode} mode={mode} parts={parts.data.items} reloadParts={parts.reload} sites={sites.data} partParam={params.get("part")} siteParam={params.get("site")} />
  );
}

function MoveForm({ mode, parts, reloadParts, sites, partParam, siteParam }: {
  mode: Mode;
  parts: PartRow[];
  reloadParts: () => void;
  sites: Site[];
  partParam: string | null;
  siteParam: string | null;
}) {
  const router = useRouter();
  const { can } = useSession();
  const editParts = can("company_admin", "stock_keeper");
  const [partMsg, setPartMsg] = useState<string | null>(null);
  // Where the part form comes back to after saving (it adds ?part= with the saved part).
  const here = `/stock/move${qs({ type: mode, site: siteParam ?? undefined })}`;
  const [partId, setPartId] = useState(partParam && parts.some((p) => p.id === partParam) ? partParam : (parts[0]?.id ?? ""));
  const [siteId, setSiteId] = useState(siteParam && sites.some((x) => x.id === siteParam) ? siteParam : (sites[0]?.id ?? ""));
  const [jobId, setJobId] = useState("");
  const current = useApi<StockPage>(partId && siteId ? `/stock${qs({ siteId, limit: 100 })}` : null);
  const jobs = useApi<Page<JobRow>>(mode === "out" && siteId ? `/jobs${qs({ siteId, active: "true", limit: 100 })}` : null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const part = parts.find((p) => p.id === partId);
  // Parts grouped by category (Chips, Boards, Power…), each showing the miner models it fits.
  const models = useApi<MinerModel[]>("/miner-models");
  const modelName = new Map((models.data ?? []).map((m) => [m.id, m.name]));
  const fitsText = (p: PartRow) => (p.modelIds.length ? ` · fits ${p.modelIds.map((id) => modelName.get(id)).filter(Boolean).join(", ")}` : "");
  const groups = Object.entries(
    parts.reduce<Record<string, PartRow[]>>((a, p) => ((a[p.category || "Other"] ??= []).push(p), a), {}),
  ).sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  const have = current.data?.items.find((r) => r.part.id === partId)?.qty ?? 0;
  const workable = (jobs.data?.items ?? []).filter((j) => j.status === "in_repair" || j.status === "waiting_parts" || j.status === "todo");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = Number(f.get("qty"));
    const reason = String(f.get("reason") ?? "").trim();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (mode === "out" && jobId) await api(`/jobs/${jobId}/parts`, { method: "POST", body: { partId, qty: n } });
      else if (mode === "adjust") await api("/stock/adjust", { method: "POST", body: { siteId, partId, countedQty: n, reason } });
      else await api(`/stock/${mode}`, { method: "POST", body: { siteId, partId, qty: n, ...(reason ? { reason } : {}) } });
      router.push(siteParam ? `/sites/${siteParam}` : "/stock");
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  async function deletePart() {
    if (!part || !window.confirm(`Delete ${part.name} (${part.sku}) from the parts catalog?`)) return;
    setPartMsg(null);
    setError(null);
    try {
      const r = await api<{ outcome: "deleted" | "retired" }>(`/parts/${part.id}`, { method: "DELETE" });
      setPartMsg(
        r.outcome === "deleted"
          ? `${part.name} was deleted.`
          : `${part.name} has stock history, so it was retired instead: it no longer shows in this list, and old jobs keep it.`,
      );
      setPartId(parts.find((p) => p.id !== part.id)?.id ?? "");
      reloadParts();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const partTools = editParts ? (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      <a className="font-semibold text-info hover:underline" href={`/parts/new${qs({ back: here })}`}>
        + New part
      </a>
      {part && (
        <a className="font-semibold text-info hover:underline" href={`/parts/${part.id}/edit${qs({ back: here })}`}>
          Edit this part
        </a>
      )}
      {part && (
        <button type="button" className="font-semibold text-danger hover:underline" onClick={deletePart}>
          Delete this part
        </button>
      )}
    </span>
  ) : undefined;

  const text = TEXT[mode];
  return (
    <>
      <PageHeader
        title={text.title}
        subtitle={text.subtitle}
        actions={
          <ButtonLink href="/stock" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      {partMsg && <Alert tone="success">{partMsg}</Alert>}
      {parts.length === 0 ? (
        <div className="text-muted">
          <p className="mb-3">Add parts to the catalog first.</p>
          {editParts && <ButtonLink href={`/parts/new${qs({ back: here })}`}>+ Add part</ButtonLink>}
        </div>
      ) : (
        <FormCard onSubmit={submit} error={error} busy={busy} cancelHref="/stock" submitLabel={text.submit}>
          <Field label="Part" error={fields.partId} hint={partTools}>
            {(id) => (
              <Select id={id} value={partId} onChange={(e) => setPartId(e.target.value)}>
                {groups.map(([cat, ps]) => (
                  <optgroup key={cat} label={cat}>
                    {ps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}){fitsText(p)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Site" error={fields.siteId} hint={part && current.data ? `Now at this site: ${have} ${part.unit}` : undefined}>
            {(id) => (
              <Select
                id={id}
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setJobId("");
                }}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={mode === "adjust" ? "Counted quantity" : "Quantity"} error={fields.qty ?? fields.countedQty}>
            {(id) => <Input id={id} name="qty" type="number" min={mode === "adjust" ? 0 : 1} defaultValue={mode === "adjust" ? have : 1} key={`${partId}:${siteId}:${have}`} required />}
          </Field>
          {mode === "out" && (
            <Field label="Job ticket" hint="Parts used in a job show on the job and in the device history">
              {(id) => (
                <Select id={id} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">No job (write-off, give a reason)</option>
                  {workable.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.number} · {j.device.model} · {j.customer.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {!(mode === "out" && jobId) && (
            <Field label={mode === "in" ? "Note (optional)" : "Reason (required)"} error={fields.reason}>
              {(id) => <Textarea id={id} name="reason" placeholder={mode === "in" ? "e.g. Supplier delivery, invoice 1234" : "e.g. Damaged during check"} required={mode !== "in"} />}
            </Field>
          )}
        </FormCard>
      )}
    </>
  );
}
