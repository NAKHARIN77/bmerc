"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { Page, PartDetail, PartRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, Chip, DetailList, Drawer, ErrorState, Field, Input, Loading, PageHeader, Pager, Select, Table, Toolbar } from "@/components/ui";

const LIMIT = 20;
type Panel = { mode: "view"; id: string } | { mode: "edit"; part: PartDetail | null } | null;

export function PartsPage() {
  const { me, can } = useSession();
  const canEdit = can("company_admin", "stock_keeper");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<"true" | "false" | "all">("true");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const search = useDebounced(q.trim());
  const list = useApi<Page<PartRow>>(me.role ? `/parts${qs({ q: search, active, page, limit: LIMIT })}` : null);

  if (!me.role) return <NoAccess />;

  const done = (text: string) => {
    setPanel(null);
    setNotice(text);
    list.reload();
  };

  return (
    <>
      <PageHeader
        title="Parts"
        subtitle={me.siteIds === null ? "Spare parts catalog and stock across all sites" : "Spare parts catalog. Stock shows only your sites"}
        actions={canEdit && <Button onClick={() => setPanel({ mode: "edit", part: null })}>+ Add part</Button>}
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      <Toolbar>
        <Field label="Search">
          {(id) => (
            <Input
              id={id}
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Name or SKU"
            />
          )}
        </Field>
        <Field label="Show">
          {(id) => (
            <Select
              id={id}
              value={active}
              onChange={(e) => {
                setActive(e.target.value as typeof active);
                setPage(1);
              }}
            >
              <option value="true">Parts in use</option>
              <option value="false">Retired parts</option>
              <option value="all">All parts</option>
            </Select>
          )}
        </Field>
      </Toolbar>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={list.data.items}
            rowKey={(p) => p.id}
            onRowClick={(p) => setPanel({ mode: "view", id: p.id })}
            empty={search ? "No parts match this search" : "No parts yet"}
            columns={[
              { header: "SKU", className: "whitespace-nowrap", cell: (p) => <span className="font-mono text-sm text-navy">{p.sku}</span> },
              {
                header: "Part",
                cell: (p) => (
                  <div>
                    <div className="font-semibold text-navy">{p.name}</div>
                    {p.category && <div className="text-xs text-muted">{p.category}</div>}
                  </div>
                ),
              },
              { header: "In stock", className: "text-right whitespace-nowrap", cell: (p) => `${p.totalQty} ${p.unit}` },
              { header: "Min per site", className: "text-right", cell: (p) => p.minQty },
              {
                header: "Status",
                cell: (p) => (!p.isActive ? <Chip>Retired</Chip> : p.belowMin ? <Chip tone="warn">Low at a site</Chip> : <Chip tone="success">OK</Chip>),
              },
            ]}
          />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}

      <Drawer
        open={panel !== null}
        title={panel?.mode === "view" ? "Part" : panel?.part ? `Edit ${panel.part.name}` : "Add part"}
        onClose={() => setPanel(null)}
      >
        {panel?.mode === "view" && <PartPanel key={panel.id} id={panel.id} canEdit={canEdit} onEdit={(p) => setPanel({ mode: "edit", part: p })} />}
        {panel?.mode === "edit" && <PartForm key={panel.part?.id ?? "new"} part={panel.part} onDone={done} />}
      </Drawer>
    </>
  );
}

function PartPanel({ id, canEdit, onEdit }: { id: string; canEdit: boolean; onEdit: (p: PartDetail) => void }) {
  const part = useApi<PartDetail>(`/parts/${id}`);
  if (part.error) return <ErrorState error={part.error} onRetry={part.reload} />;
  if (!part.data) return <Loading />;
  const p = part.data;
  return (
    <>
      <h3 className="text-xl font-bold text-navy">{p.name}</h3>
      <p className="mb-3 font-mono text-sm text-muted">{p.sku}</p>
      <DetailList
        rows={[
          ["Category", p.category ?? "—"],
          ["Unit", p.unit],
          ["Min per site", p.minQty],
          ["Status", p.isActive ? "In use" : "Retired"],
        ]}
      />
      <h4 className="mb-2 text-sm font-semibold text-navy">Stock by site</h4>
      {p.stock.length === 0 ? (
        <p className="text-sm text-muted">No stock recorded yet.</p>
      ) : (
        <ul className="divide-y divide-soft rounded-lg bg-field text-sm">
          {p.stock.map((s) => (
            <li key={s.site.id} className="flex items-center justify-between px-3 py-2">
              <span>{s.site.name}</span>
              <span className="flex items-center gap-2">
                <b className={s.belowMin ? "text-warn" : "text-navy"}>
                  {s.qty} {p.unit}
                </b>
                {s.belowMin && <Chip tone="warn">{s.qty === 0 ? "Out" : "Low"}</Chip>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Receiving, issuing and adjusting stock come with the stock workflow.</p>
      {canEdit && (
        <Button variant="secondary" className="mt-5" onClick={() => onEdit(p)}>
          Edit
        </Button>
      )}
    </>
  );
}

function PartForm({ part, onDone }: { part: PartDetail | null; onDone: (msg: string) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const minRaw = String(f.get("minQty") ?? "").trim();
    const body = {
      sku: String(f.get("sku") ?? "").trim(),
      name: String(f.get("name") ?? "").trim(),
      category: String(f.get("category") ?? "").trim() || null,
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
      if (part) await api(`/parts/${part.id}`, { method: "PATCH", body });
      else await api("/parts", { method: "POST", body });
      onDone(part ? `Saved ${body.name}` : `Added ${body.name}`);
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="SKU" error={fields.sku} hint="Letters, digits, dot, dash and underscore">
        {(id) => <Input id={id} name="sku" defaultValue={part?.sku} required autoFocus className="font-mono" />}
      </Field>
      <Field label="Name" error={fields.name}>
        {(id) => <Input id={id} name="name" defaultValue={part?.name} placeholder="e.g. BM1398 hashing chip" required />}
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Category" error={fields.category}>
          {(id) => <Input id={id} name="category" defaultValue={part?.category ?? ""} placeholder="e.g. Chips" />}
        </Field>
        <Field label="Unit" error={fields.unit}>
          {(id) => <Input id={id} name="unit" defaultValue={part?.unit ?? "pcs"} />}
        </Field>
      </div>
      <Field label="Minimum per site" error={fields.minQty} hint="Below this, the site shows Low and the stock keeper is told">
        {(id) => <Input id={id} name="minQty" type="number" min={0} step={1} inputMode="numeric" defaultValue={part?.minQty ?? 0} />}
      </Field>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={part?.isActive ?? true} />
        In use (untick to retire a part you no longer stock)
      </label>
      <Button type="submit" busy={busy} className="w-full">
        {part ? "Save changes" : "Add part"}
      </Button>
    </form>
  );
}
