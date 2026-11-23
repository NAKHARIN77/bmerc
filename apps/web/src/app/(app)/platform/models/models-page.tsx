"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { MinerModel } from "@/lib/types";
import { Alert, Button, Card, ErrorState, Field, Input, Loading, PageHeader } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { ModelList } from "../../miner-models/miner-models-page";

/**
 * Platform owner: the miner model list every company uses (hashboards, chip, chips per board).
 * Tick Checked once the numbers are confirmed on a real unit or the maker's sheet.
 */
export function PlatformModelsPage() {
  return (
    <OwnerOnly>
      <Models />
    </OwnerOnly>
  );
}

type Row = MinerModel & { devices: number };

function Models() {
  const list = useApi<Row[]>("/platform/miner-models");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const rows = list.data;
  const unchecked = rows.filter((m) => !m.verified && m.isActive).length;
  return (
    <>
      <PageHeader
        title="Miner models"
        subtitle="Hashboards and chips per model, used by every company at intake, when picking parts and recording boards"
        actions={<Button onClick={() => setEditing("new")}>+ Add model</Button>}
      />
      {unchecked > 0 && (
        <Alert tone="warn">
          {unchecked} {unchecked === 1 ? "model has" : "models have"} numbers that are not checked yet. Open each one, compare with a real unit or the maker&apos;s sheet, then tick Checked.
        </Alert>
      )}
      {editing && (
        <ModelForm
          key={editing === "new" ? "new" : editing.id}
          model={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      <ModelList
        models={rows}
        action={(m) => (
          <Button
            variant="secondary"
            className="h-9"
            onClick={() => {
              setEditing(rows.find((r) => r.id === m.id) ?? null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Edit
          </Button>
        )}
      />
    </>
  );
}

function ModelForm({ model: m, onDone, onCancel }: { model: Row | null; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (String(f.get(k) ?? "").trim() === "" ? null : Number(f.get(k)));
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const body = {
      brand: String(f.get("brand") ?? "").trim(),
      name: String(f.get("name") ?? "").trim(),
      hashboards: Number(f.get("hashboards")),
      chipModel: text("chipModel"),
      chipsPerBoard: num("chipsPerBoard"),
      hashrateTh: num("hashrateTh"),
      notes: text("notes"),
      sourceUrl: text("sourceUrl"),
      verified: f.get("verified") === "on",
      isActive: f.get("isActive") === "on",
    };
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await (m ? api(`/platform/miner-models/${m.id}`, { method: "PATCH", body }) : api("/platform/miner-models", { method: "POST", body }));
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setFields(err.fieldErrors());
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <b className="text-base">{m ? `Edit ${m.name}` : "Add a miner model"}</b>
      {m && m.devices > 0 && <p className="mt-1 text-xs text-muted">{m.devices} devices in repair records use this model.</p>}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <form onSubmit={submit} noValidate className="mt-3">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Brand" error={fields.brand}>
            {(id) => <Input id={id} name="brand" defaultValue={m?.brand ?? ""} placeholder="e.g. Bitmain" required />}
          </Field>
          <Field label="Model name" error={fields.name}>
            {(id) => <Input id={id} name="name" defaultValue={m?.name ?? ""} placeholder="e.g. Antminer S19j Pro" required />}
          </Field>
          <Field label="Hashboards" error={fields.hashboards}>
            {(id) => <Input id={id} name="hashboards" type="number" min={1} max={12} defaultValue={m?.hashboards ?? 3} />}
          </Field>
          <Field label="Hashrate (TH/s)" error={fields.hashrateTh}>
            {(id) => <Input id={id} name="hashrateTh" type="number" min={0} step="0.1" defaultValue={m?.hashrateTh ?? ""} />}
          </Field>
          <Field label="Chip model" error={fields.chipModel}>
            {(id) => <Input id={id} name="chipModel" defaultValue={m?.chipModel ?? ""} placeholder="e.g. BM1362" />}
          </Field>
          <Field label="Chips per board" error={fields.chipsPerBoard}>
            {(id) => <Input id={id} name="chipsPerBoard" type="number" min={1} defaultValue={m?.chipsPerBoard ?? ""} />}
          </Field>
          <Field label="Source link" error={fields.sourceUrl}>
            {(id) => <Input id={id} name="sourceUrl" type="url" defaultValue={m?.sourceUrl ?? ""} placeholder="https://…" />}
          </Field>
          <Field label="Notes" error={fields.notes}>
            {(id) => <Input id={id} name="notes" defaultValue={m?.notes ?? ""} />}
          </Field>
        </div>
        <div className="mb-4 flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="verified" defaultChecked={m?.verified ?? false} />
            Checked: the numbers match a real unit or the maker&apos;s sheet
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isActive" defaultChecked={m?.isActive ?? true} />
            Show to companies
          </label>
        </div>
        <div className="flex gap-2.5">
          <Button type="submit" busy={busy}>
            {m ? "Save model" : "Save new model"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
