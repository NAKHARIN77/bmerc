"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { MinerModel, PartDetail } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, ErrorState, Field, FormCard, Input, Loading, PageHeader } from "@/components/ui";

/** /parts/new and /parts/[id]/edit (company admins and stock keepers). */
export function PartFormPage({ mode }: { mode: "new" | "edit" }) {
  // A fresh start on every visit by link: Next keeps visited pages alive, and an edit form must never show old values.
  const { bfcacheId } = useRouter();
  return <PartFormLoader key={bfcacheId} mode={mode} />;
}

function PartFormLoader({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id?: string }>();
  const { can } = useSession();
  const allowed = can("company_admin", "stock_keeper");
  const existing = useApi<PartDetail>(mode === "edit" && allowed ? `/parts/${id}` : null);
  const categories = useApi<string[]>(allowed ? "/parts/categories" : null);
  const models = useApi<MinerModel[]>(allowed ? "/miner-models" : null);
  // A model added on the Miner models page (other tab) shows up when the user comes back here.
  const reloadModels = models.reload;
  useEffect(() => {
    window.addEventListener("focus", reloadModels);
    return () => window.removeEventListener("focus", reloadModels);
  }, [reloadModels]);
  if (!allowed) return <NoAccess />;
  if (mode === "edit") {
    if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
    if (!existing.data) return <Loading />;
  }
  // Keyed on the loaded data: Next keeps this page alive between visits, so a fresh load must rebuild the form.
  if (!models.data) return <Loading />;
  return <PartForm key={existing.data ? JSON.stringify(existing.data) : "new"} part={existing.data ?? null} categories={categories.data ?? []} models={models.data} />;
}

function PartForm({ part, categories, models }: { part: PartDetail | null; categories: string[]; models: MinerModel[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Opened from the stock form (?back=/stock/move...): return there with the saved part picked.
  const backParam = useSearchParams().get("back");
  const returnTo = backParam && backParam.startsWith("/") && !backParam.startsWith("//") ? backParam : null;
  const back = returnTo ?? (part ? `/parts/${part.id}` : "/parts");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const minRaw = String(f.get("minQty") ?? "").trim();
    const body = {
      sku: String(f.get("sku") ?? "").trim(),
      name: String(f.get("name") ?? "").trim(),
      category: String(f.get("category") ?? "").trim() || null,
      modelIds: f.getAll("modelIds").map(String),
      unit: String(f.get("unit") ?? "").trim() || "pcs",
      minQty: minRaw === "" ? 0 : Number(minRaw),
      isActive: f.get("isActive") === "on",
    };
    if (!Number.isInteger(body.minQty) || body.minQty < 0) {
      setFields({ minQty: "A whole number, 0 or more" });
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const saved = part ? await api<{ id: string }>(`/parts/${part.id}`, { method: "PATCH", body }) : await api<{ id: string }>("/parts", { method: "POST", body });
      // Next keeps this page alive (hidden) after navigating away, so clear it for the next visit.
      form.reset();
      setBusy(false);
      router.push(returnTo ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}part=${saved.id}` : `/parts/${saved.id}`);
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={part ? `Edit ${part.name}` : "New part"}
        subtitle="Parts in the catalog can be received, issued to jobs and adjusted at each site"
        actions={
          <ButtonLink href={back} variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <FormCard onSubmit={submit} error={error} busy={busy} cancelHref={back} submitLabel="Save part">
        <Field label="Part name" error={fields.name}>
          {(id) => <Input id={id} name="name" defaultValue={part?.name} placeholder="e.g. Hashing chip BM1398" required autoFocus />}
        </Field>
        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="SKU" error={fields.sku} hint="Letters, digits, dot, dash and underscore">
            {(id) => <Input id={id} name="sku" defaultValue={part?.sku} placeholder="e.g. CHIP-BM1398" required />}
          </Field>
          <Field label="Category" error={fields.category}>
            {(id) => (
              <>
                <Input id={id} name="category" list="part-categories" defaultValue={part?.category ?? ""} placeholder="e.g. Chips" />
                <datalist id="part-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Unit" error={fields.unit}>
            {(id) => <Input id={id} name="unit" defaultValue={part?.unit ?? "pcs"} />}
          </Field>
          <Field label="Minimum per site" error={fields.minQty} hint="Below this the site shows Low">
            {(id) => <Input id={id} name="minQty" type="number" min={0} step={1} inputMode="numeric" defaultValue={part?.minQty ?? 0} />}
          </Field>
        </div>
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-muted">Fits these miner models (leave all unticked if it fits any model, like fans or thermal paste)</legend>
          <div className="grid gap-x-4 gap-y-1.5 rounded-lg bg-[#f6f8ff] p-3 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="modelIds" value={m.id} defaultChecked={part?.modelIds.includes(m.id) ?? false} />
                <span>
                  {m.name}
                  {m.chipModel && <span className="text-muted"> · {m.chipModel}</span>}
                </span>
              </label>
            ))}
            {models.length === 0 && <span className="text-sm text-muted">No miner models yet.</span>}
          </div>
          <p className="mt-1 text-xs text-neutral">
            Model not listed?{" "}
            <a href="/miner-models" target="_blank" rel="noreferrer" className="font-semibold text-info hover:underline">
              Add it on Miner models
            </a>{" "}
            (opens in a new tab). It shows here when you come back to this tab.
          </p>
        </fieldset>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={part?.isActive ?? true} />
          In use (untick to retire a part you no longer stock)
        </label>
      </FormCard>
    </>
  );
}
