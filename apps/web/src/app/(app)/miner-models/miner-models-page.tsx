"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { MinerModel } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, Chip, ErrorState, Field, Input, Loading, PageHeader, Table } from "@/components/ui";

/**
 * Hashboards and chips of each miner model: the shared BMERC list, plus models the company added itself.
 * Company admins and stock keepers add, edit and delete their own models; the BMERC list is read-only here.
 */
export function MinerModelsPage() {
  const { can } = useSession();
  const editor = can("company_admin", "stock_keeper");
  const list = useApi<MinerModel[]>("/miner-models");
  const [editing, setEditing] = useState<MinerModel | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(m: MinerModel) {
    if (!window.confirm(`Delete ${m.name}? Parts stop listing it; devices keep the model name.`)) return;
    setError(null);
    setNotice(null);
    try {
      await api(`/miner-models/${m.id}`, { method: "DELETE" });
      setNotice(`${m.name} was deleted.`);
      if (editing !== "new" && editing?.id === m.id) setEditing(null);
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Miner models"
        subtitle="Hashboards and chips of each model. Used when you receive a device, pick parts and record boards"
        actions={
          <>
            <ButtonLink href="/parts" variant="secondary">
              Back to parts
            </ButtonLink>
            {editor && (
              <Button
                onClick={() => {
                  setNotice(null);
                  setEditing("new");
                }}
              >
                + Add model
              </Button>
            )}
          </>
        }
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      {editing && (
        <ModelForm
          key={editing === "new" ? "new" : editing.id}
          base="/miner-models"
          model={editing === "new" ? null : editing}
          onDone={() => {
            setNotice(editing === "new" ? "Model added. It now shows when you receive a device and when you pick the models a part fits." : "Model saved.");
            setEditing(null);
            list.reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <ModelList
            models={list.data}
            action={
              editor
                ? (m) =>
                    m.own ? (
                      <span className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="h-9"
                          onClick={() => {
                            setNotice(null);
                            setEditing(m);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="danger" className="h-9" onClick={() => remove(m)}>
                          Delete
                        </Button>
                      </span>
                    ) : null
                : undefined
            }
          />
          <p className="mt-3 text-xs text-muted">
            Your company: models you added; only your company sees them. Checked and Not checked are on the BMERC list, which only BMERC changes. Not checked
            means BMERC has not yet confirmed the numbers on a real unit.
          </p>
        </>
      )}
    </>
  );
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function ModelList({ models, action }: { models: MinerModel[]; action?: (m: MinerModel) => ReactNode }) {
  return (
    <Table
      rows={models}
      rowKey={(m) => m.id}
      empty="No miner models yet"
      columns={[
        { header: "Model", cell: (m) => m.name },
        { header: "Brand", cell: (m) => m.brand },
        { header: "Hashboards", cell: (m) => m.hashboards },
        { header: "Chip", cell: (m) => m.chipModel ?? "—" },
        { header: "Chips per board", cell: (m) => m.chipsPerBoard ?? "—" },
        { header: "Hashrate", cell: (m) => (m.hashrateTh ? `${Number(m.hashrateTh)} TH/s` : "—") },
        { header: "Notes", cell: (m) => m.notes ?? "—" },
        {
          header: "Source",
          cell: (m) =>
            m.sourceUrl ? (
              <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-info hover:underline">
                {host(m.sourceUrl)}
              </a>
            ) : (
              "—"
            ),
        },
        { header: "Status", cell: (m) => (m.own ? <Chip tone="info">Your company</Chip> : !m.isActive ? <Chip tone="neutral">Hidden</Chip> : m.verified ? <Chip tone="success">Checked</Chip> : <Chip tone="warn">Not checked</Chip>) },
        ...(action ? [{ header: "", cell: action }] : []),
      ]}
    />
  );
}

/** Add or edit a model. platform: the shared BMERC list (with Checked and Show to companies); otherwise a company's own model. */
export function ModelForm({ model: m, base, platform = false, onDone, onCancel }: {
  model: (MinerModel & { devices?: number }) | null;
  base: string;
  platform?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
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
      ...(platform ? { verified: f.get("verified") === "on", isActive: f.get("isActive") === "on" } : {}),
    };
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await (m ? api(`${base}/${m.id}`, { method: "PATCH", body }) : api(base, { method: "POST", body }));
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
      {m && !!m.devices && <p className="mt-1 text-xs text-muted">{m.devices} devices in repair records use this model.</p>}
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
        {platform && (
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
        )}
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
