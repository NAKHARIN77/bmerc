"use client";

import { DEVICE_KIND_LABEL } from "@bmerc/shared";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { qs, useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { CustomerDetail, CustomerRow, Page } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, DetailList, Drawer, ErrorState, Field, Input, Loading, PageHeader, Pager, Table, Toolbar } from "@/components/ui";

const LIMIT = 20;
type Panel = { mode: "view"; id: string } | { mode: "edit"; customer: CustomerDetail | null } | null;

export function CustomersPage() {
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const isAdmin = can("company_admin");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const search = useDebounced(q.trim());
  const list = useApi<Page<CustomerRow>>(allowed ? `/customers${qs({ q: search, page, limit: LIMIT })}` : null);

  if (!allowed) return <NoAccess />;

  const done = (text: string) => {
    setPanel(null);
    setNotice(text);
    list.reload();
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="People and companies who send devices in for repair. They do not have an account"
        actions={isAdmin && <Button onClick={() => setPanel({ mode: "edit", customer: null })}>+ Add customer</Button>}
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
              placeholder="Customer name"
            />
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
            rowKey={(c) => c.id}
            onRowClick={(c) => setPanel({ mode: "view", id: c.id })}
            empty={search ? "No customers match this name" : "No customers yet"}
            columns={[
              { header: "Name", cell: (c) => <span className="font-semibold text-navy">{c.name}</span> },
              { header: "Country", cell: (c) => c.country ?? "—" },
              { header: "Devices", className: "text-right", cell: (c) => c.devices },
              { header: "Open jobs", className: "text-right", cell: (c) => c.openJobs },
            ]}
          />
          <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </>
      )}

      <Drawer
        open={panel !== null}
        title={panel?.mode === "view" ? "Customer" : panel?.customer ? `Edit ${panel.customer.name}` : "Add customer"}
        onClose={() => setPanel(null)}
      >
        {panel?.mode === "view" && <CustomerPanel key={panel.id} id={panel.id} canEdit={isAdmin} onEdit={(c) => setPanel({ mode: "edit", customer: c })} onDeleted={done} />}
        {panel?.mode === "edit" && <CustomerForm key={panel.customer?.id ?? "new"} customer={panel.customer} onDone={done} />}
      </Drawer>
    </>
  );
}

function CustomerPanel({ id, canEdit, onEdit, onDeleted }: { id: string; canEdit: boolean; onEdit: (c: CustomerDetail) => void; onDeleted: (msg: string) => void }) {
  const c = useApi<CustomerDetail>(`/customers/${id}`);
  const [error, setError] = useState<string | null>(null);
  if (c.error) return <ErrorState error={c.error} onRetry={c.reload} />;
  if (!c.data) return <Loading />;
  const d = c.data;

  async function remove() {
    if (!window.confirm(`Delete ${d.name}? This cannot be undone.`)) return;
    setError(null);
    try {
      await api(`/customers/${d.id}`, { method: "DELETE" });
      onDeleted(`${d.name} was deleted`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      {error && <Alert>{error}</Alert>}
      <h3 className="mb-3 text-xl font-bold text-navy">{d.name}</h3>
      <DetailList
        rows={[
          ["Contact", d.contactName ?? "—"],
          ["Phone", d.phone ?? "—"],
          ["Email", d.email ?? "—"],
          ["Country", d.country ?? "—"],
        ]}
      />
      <h4 className="mb-2 text-sm font-semibold text-navy">Devices ({d.devices.length})</h4>
      {d.devices.length === 0 ? (
        <p className="text-sm text-muted">No devices received yet.</p>
      ) : (
        <ul className="divide-y divide-soft rounded-lg bg-field text-sm">
          {d.devices.map((v) => (
            <li key={v.id} className="px-3 py-2">
              <div className="text-ink">{v.model}</div>
              <div className="text-xs text-muted">
                {DEVICE_KIND_LABEL[v.kind]} · {v.serialNo}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={() => onEdit(d)}>
            Edit
          </Button>
          <Button variant="danger" onClick={remove} disabled={d.devices.length > 0} title={d.devices.length ? "Customers with devices cannot be deleted" : undefined}>
            Delete
          </Button>
        </div>
      )}
    </>
  );
}

const FIELDS = ["contactName", "email", "phone", "country"] as const;

function CustomerForm({ customer, onDone }: { customer: CustomerDetail | null; onDone: (msg: string) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, string | null> = { name: String(f.get("name") ?? "").trim() };
    for (const k of FIELDS) body[k] = String(f.get(k) ?? "").trim() || null; // empty clears the field
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (customer) await api(`/customers/${customer.id}`, { method: "PATCH", body });
      else await api("/customers", { method: "POST", body });
      onDone(customer ? `Saved ${body.name}` : `Added ${body.name}`);
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
      <Field label="Name" error={fields.name} hint="Person or company that sends the devices">
        {(id) => <Input id={id} name="name" defaultValue={customer?.name} required autoFocus />}
      </Field>
      <Field label="Contact person" error={fields.contactName}>
        {(id) => <Input id={id} name="contactName" defaultValue={customer?.contactName ?? ""} />}
      </Field>
      <Field label="Phone" error={fields.phone}>
        {(id) => <Input id={id} name="phone" type="tel" defaultValue={customer?.phone ?? ""} />}
      </Field>
      <Field label="Email" error={fields.email}>
        {(id) => <Input id={id} name="email" type="email" defaultValue={customer?.email ?? ""} />}
      </Field>
      <Field label="Country" error={fields.country}>
        {(id) => <Input id={id} name="country" defaultValue={customer?.country ?? ""} />}
      </Field>
      <Button type="submit" busy={busy} className="mt-2 w-full">
        {customer ? "Save changes" : "Add customer"}
      </Button>
    </form>
  );
}
