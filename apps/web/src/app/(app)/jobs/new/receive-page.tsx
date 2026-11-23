"use client";

import { DEVICE_KINDS, DEVICE_KIND_LABEL, JOB_PRIORITIES } from "@bmerc/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Assignee, CustomerRow, Page, Site, Team } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { ButtonLink, Field, FormCard, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

const MODELS = ["Antminer S19", "Antminer S19 Pro", "Antminer S19j Pro", "Antminer S19 XP", "Antminer S21", "Antminer S21 Pro", "Whatsminer M30S", "Whatsminer M30S++", "Whatsminer M50", "Whatsminer M60", "Avalon A1246", "Avalon A1366"];
const PRIORITY_LABEL = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" } as const;

/** Receive Work Order (intake): a device arrives at a site and gets its job. */
export function ReceivePage() {
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const customers = useApi<Page<CustomerRow>>(allowed ? "/customers?limit=100" : null);
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  if (!allowed) return <NoAccess />;
  if (!customers.data || !sites.data) return <Loading />;
  const open = sites.data.filter((s) => s.status !== "inactive");
  return <ReceiveForm customers={customers.data.items} sites={open} />;
}

function ReceiveForm({ customers, sites }: { customers: CustomerRow[]; sites: Site[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [siteId, setSiteId] = useState(sites.find((x) => x.id === params.get("site"))?.id ?? sites[0]?.id ?? "");
  const [teamId, setTeamId] = useState("");
  const assignees = useApi<Assignee[]>(siteId ? `/jobs/assignees?siteId=${siteId}` : null);
  const teams = useApi<Team[]>("/teams");
  const siteTeams = (teams.data ?? []).filter((t) => t.siteId === siteId);
  const pickable = (assignees.data ?? []).filter((a) => !teamId || a.teamId === teamId);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const hashrate = get("hashrateTh");
    const body = {
      customerId: get("customerId"),
      siteId,
      kind: get("kind"),
      model: get("model"),
      serialNo: get("serialNo"),
      hashrateTh: hashrate ? Number(hashrate) : null,
      reportedFault: get("reportedFault"),
      priority: get("priority"),
      assigneeId: get("assigneeId") || null,
    };
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const job = await api<{ id: string; number: string }>("/jobs", { method: "POST", body });
      router.push(`/jobs/${job.id}?received=1`);
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="Receive Work Order (intake)" subtitle="Receive a device at the repair center and create its job" />
        <p className="text-muted">
          Add a customer first. <Link className="font-semibold text-info" href="/customers/new">Add customer</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Receive Work Order (intake)"
        subtitle="Receive a device at the repair center and create its job"
        actions={
          <ButtonLink href="/jobs" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />
      <FormCard onSubmit={submit} error={error} busy={busy} cancelHref="/jobs" submitLabel="Receive job">
        <Field label="Customer" error={fields.customerId}>
          {(id) => (
            <Select id={id} name="customerId" defaultValue={params.get("customer") ?? customers[0].id} required>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Site" error={fields.siteId}>
          {(id) => (
            <Select
              id={id}
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setTeamId("");
              }}
              required
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Team">
          {(id) => (
            <Select id={id} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">{siteTeams.length ? "Any team at this site" : "No team at this site yet"}</option>
              {siteTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Assign to technician" error={fields.assigneeId} hint="You can also assign later on the bench board">
          {(id) => (
            <Select id={id} name="assigneeId" key={`${siteId}:${teamId}`} defaultValue="">
              <option value="">Unassigned</option>
              {pickable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                  {a.team ? ` · ${a.team}` : ""} · {a.openJobs} open {a.openJobs === 1 ? "job" : "jobs"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="mb-3 text-[13px]">
          <Link href="/devices" className="font-semibold text-info hover:underline">
            Check repair history by serial number
          </Link>
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Item received" error={fields.kind}>
            {(id) => (
              <Select id={id} name="kind" defaultValue="miner">
                {DEVICE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DEVICE_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Model" error={fields.model}>
            {(id) => (
              <>
                <Input id={id} name="model" list="models" placeholder="e.g. Antminer S19 Pro" required />
                <datalist id="models">
                  {MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Serial number" error={fields.serialNo}>
            {(id) => <Input id={id} name="serialNo" placeholder="Scan or type the serial" required autoComplete="off" />}
          </Field>
          <Field label="Hashrate (TH/s, optional)" error={fields.hashrateTh}>
            {(id) => <Input id={id} name="hashrateTh" type="number" min={0} step="0.01" inputMode="decimal" />}
          </Field>
        </div>
        <Field label="Priority" error={fields.priority}>
          {(id) => (
            <Select id={id} name="priority" defaultValue="normal">
              {JOB_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reported fault" error={fields.reportedFault}>
          {(id) => <Textarea id={id} name="reportedFault" placeholder="Describe the symptoms" required />}
        </Field>
      </FormCard>
    </>
  );
}
