"use client";

import { countries, ROLE_LABEL, type Role } from "@bmerc/shared";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Page, Site, Team, UserRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, Field, Input, Loading, PageHeader, Select, Table } from "@/components/ui";

type Step = 1 | 2 | 3;
interface Company {
  name: string;
  legalName: string | null;
  taxId: string | null;
  billingEmail: string | null;
  timezone: string;
  country: string | null;
}

/** Prototype "Setup wizard": company info, sites, then teams and staff. Each step saves straight away. */
export function SetupPage() {
  const { can } = useSession();
  const [step, setStep] = useState<Step>(1);
  if (!can("company_admin")) return <NoAccess />;
  const tabs: Array<[Step, string]> = [
    [1, "1. Company info"],
    [2, "2. Sites"],
    [3, "3. Teams and staff"],
  ];
  return (
    <>
      <PageHeader
        title="Set up your company"
        subtitle="Three short steps. You can change everything later"
        actions={
          <ButtonLink href="/dashboard" variant="secondary">
            Skip for now
          </ButtonLink>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {tabs.map(([n, label]) => (
          <button
            key={n}
            onClick={() => setStep(n)}
            className={`rounded-xl p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)] ${n === step ? "bg-primary text-white" : "bg-white text-muted hover:bg-field"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {step === 1 && <CompanyStep next={() => setStep(2)} />}
      {step === 2 && <SitesStep next={() => setStep(3)} />}
      {step === 3 && <TeamsStep />}
    </>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await fn();
      return true;
    } catch (e) {
      const f = e instanceof ApiError ? e.fieldErrors() : {};
      setFields(f);
      setError(Object.keys(f).length ? null : errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, fields, run };
}

function CompanyStep({ next }: { next: () => void }) {
  const company = useApi<Company>("/company");
  const s = useSubmit();
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  if (!company.data) return <Loading />;
  const c = company.data;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const ok = await s.run(() =>
      api("/company", { method: "PATCH", body: { name: v("name"), legalName: v("legalName") || null, taxId: v("taxId") || null, billingEmail: v("billingEmail") || null, timezone: v("timezone"), country: v("country") } }),
    );
    if (ok) next();
  }

  return (
    <Card className="max-w-[720px]">
      <form onSubmit={save} noValidate>
        {s.error && <Alert>{s.error}</Alert>}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Company name" error={s.fields.name}>
            {(id) => <Input id={id} name="name" defaultValue={c.name} required />}
          </Field>
          <Field label="Legal name (on invoices)" error={s.fields.legalName}>
            {(id) => <Input id={id} name="legalName" defaultValue={c.legalName ?? ""} placeholder="e.g. Siam Hash Repair Co., Ltd." />}
          </Field>
          <Field label="Registration number" error={s.fields.taxId}>
            {(id) => <Input id={id} name="taxId" defaultValue={c.taxId ?? ""} placeholder="e.g. 0105560000000" />}
          </Field>
          <Field label="Contact email" error={s.fields.billingEmail}>
            {(id) => <Input id={id} name="billingEmail" type="email" defaultValue={c.billingEmail ?? ""} placeholder="admin@company.com" />}
          </Field>
          <Field label="Country" error={s.fields.country}>
            {(id) => (
              <Select id={id} name="country" defaultValue={c.country ?? ""}>
                {countries().map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Time zone" error={s.fields.timezone}>
            {(id) => (
              <Select id={id} name="timezone" defaultValue={c.timezone}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" busy={s.busy}>
            Save and continue
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SitesStep({ next }: { next: () => void }) {
  const sites = useApi<Site[]>("/sites");
  const s = useSubmit();

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    if (await s.run(() => api("/sites", { method: "POST", body: { name: v("name"), country: v("country") || null, province: v("province") || null, status: "active" } }))) {
      form.reset();
      sites.reload();
    }
  }

  return (
    <Card>
      <p className="mb-4 text-[13px] text-muted">A site is one of your repair center branches. Customers send devices to a site for repair.</p>
      <form onSubmit={add} noValidate className="grid gap-x-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <Field label="Site name" error={s.fields.name}>
          {(id) => <Input id={id} name="name" placeholder="e.g. Bangkok Hash Lab 01" required />}
        </Field>
        <Field label="Country" error={s.fields.country}>
          {(id) => <Input id={id} name="country" placeholder="e.g. Thailand" />}
        </Field>
        <Field label="City / Province" error={s.fields.province}>
          {(id) => <Input id={id} name="province" placeholder="e.g. Bangkok" />}
        </Field>
        <div className="mb-4">
          <Button type="submit" variant="secondary" busy={s.busy}>
            Add site
          </Button>
        </div>
      </form>
      {s.error && <Alert>{s.error}</Alert>}
      <b className="mb-2 block">Sites added</b>
      <Table
        rows={sites.data ?? []}
        rowKey={(x) => x.id}
        empty="No sites yet"
        columns={[
          { header: "Site", cell: (x) => x.name },
          { header: "Country", cell: (x) => x.country ?? "—" },
          { header: "City / Province", cell: (x) => x.province ?? "—" },
        ]}
      />
      <div className="mt-4 flex justify-end">
        <Button onClick={next} disabled={!sites.data?.length}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

const STAFF_ROLES: Role[] = ["site_manager", "head_technician", "technician", "stock_keeper"];

function TeamsStep() {
  const router = useRouter();
  const sites = useApi<Site[]>("/sites");
  const teams = useApi<Team[]>("/teams");
  const users = useApi<Page<UserRow>>("/users?limit=100");
  const t = useSubmit();
  const u = useSubmit();
  const [role, setRole] = useState<Role>("technician");
  const siteName = (id: string) => sites.data?.find((x) => x.id === id)?.name ?? "—";

  async function addTeam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (await t.run(() => api("/teams", { method: "POST", body: { name: String(f.get("name") ?? "").trim(), siteId: String(f.get("siteId") ?? "") } }))) {
      form.reset();
      teams.reload();
    }
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const bySite = role === "site_manager" || role === "stock_keeper";
    const body = {
      fullName: String(f.get("fullName") ?? "").trim(),
      email: String(f.get("email") ?? "").trim(),
      role,
      teamId: bySite ? null : String(f.get("teamId") ?? "") || null,
      siteIds: bySite ? f.getAll("siteIds").map(String) : undefined,
    };
    if (await u.run(() => api("/users", { method: "POST", body }))) {
      form.reset();
      users.reload();
      teams.reload();
    }
  }

  if (!sites.data) return <Loading />;
  const bySite = role === "site_manager" || role === "stock_keeper";
  return (
    <div className="grid gap-4">
      <Card>
        <b className="text-base">Teams</b>
        <form onSubmit={addTeam} noValidate className="mt-3 grid gap-x-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
          <Field label="Team name" error={t.fields.name}>
            {(id) => <Input id={id} name="name" placeholder="e.g. Team Alpha" required />}
          </Field>
          <Field label="Site" error={t.fields.siteId}>
            {(id) => (
              <Select id={id} name="siteId">
                {sites.data!.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="mb-4">
            <Button type="submit" variant="secondary" busy={t.busy}>
              Add team
            </Button>
          </div>
        </form>
        {t.error && <Alert>{t.error}</Alert>}
        <Table
          rows={teams.data ?? []}
          rowKey={(x) => x.id}
          empty="No teams yet"
          columns={[
            { header: "Team", cell: (x) => x.name },
            { header: "Site", cell: (x) => x.site.name },
            { header: "Members", cell: (x) => x.members.length },
          ]}
        />
      </Card>
      <Card>
        <b className="text-base">Staff</b>
        <p className="mt-1 text-[13px] text-muted">Each person gets an email invite to set their password. A site manager or stock keeper sees only the sites picked here (hold Ctrl or Cmd to pick more than one).</p>
        <form onSubmit={invite} noValidate className="mt-3 grid gap-x-4 sm:grid-cols-2">
          <Field label="Full name" error={u.fields.fullName}>
            {(id) => <Input id={id} name="fullName" placeholder="e.g. Somsak P." required />}
          </Field>
          <Field label="Email" error={u.fields.email}>
            {(id) => <Input id={id} name="email" type="email" placeholder="name@company.com" required />}
          </Field>
          <Field label="Role" error={u.fields.role}>
            {(id) => (
              <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {bySite ? (
            <Field label="Sites" error={u.fields.siteIds}>
              {(id) => (
                <Select id={id} name="siteIds" multiple className="h-[88px] py-2">
                  {sites.data!.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Team" error={u.fields.teamId}>
              {(id) => (
                <Select id={id} name="teamId">
                  <option value="">{teams.data?.length ? "Pick a team" : "Add a team first"}</option>
                  {(teams.data ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {siteName(x.siteId)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="secondary" busy={u.busy}>
              Invite
            </Button>
          </div>
        </form>
        {u.error && <Alert>{u.error}</Alert>}
        <Table
          rows={(users.data?.items ?? []).filter((x) => x.role !== "company_admin")}
          rowKey={(x) => x.id}
          empty="No staff invited yet"
          columns={[
            { header: "Name", cell: (x) => x.fullName },
            { header: "Email", cell: (x) => x.email },
            { header: "Role", cell: (x) => (x.role ? ROLE_LABEL[x.role] : "—") },
            { header: "Team", cell: (x) => x.team?.name ?? "—" },
            { header: "Status", cell: (x) => (x.status === "invited" ? "Invite sent" : "Active") },
          ]}
        />
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => router.push("/dashboard")}>Finish setup</Button>
      </div>
    </div>
  );
}
