"use client";

import { useMemo, useState, type FormEvent } from "react";
import { countries, fmtTaxRate } from "@bmerc/shared";
import { api, ApiError, errorMessage } from "@/lib/api";
import { fmtLimit } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Usage } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, Card, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

interface Company {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  timezone: string;
  country: string | null;
  currency: string;
  taxRateBps: number;
}

const TEXT_FIELDS = ["legalName", "taxId", "billingEmail", "billingAddress"] as const;

export function CompanySettings() {
  const { can, reload: reloadSession } = useSession();
  const company = useApi<Company>(can("company_admin") ? "/company" : null);
  const usage = useApi<Usage>(can("company_admin") ? "/company/usage" : null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const zones = useMemo(() => {
    const list = Intl.supportedValuesOf("timeZone");
    const cur = company.data?.timezone;
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }, [company.data?.timezone]);

  const currencies = useMemo(() => {
    const list = Intl.supportedValuesOf("currency");
    const cur = company.data?.currency;
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }, [company.data?.currency]);

  if (!can("company_admin")) return <NoAccess />;
  if (company.error) return <ErrorState error={company.error} onRetry={company.reload} />;
  if (!company.data) return <Loading />;
  const c = company.data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, string | number | null> = {
      name: String(f.get("name") ?? ""),
      timezone: String(f.get("timezone") ?? ""),
      currency: String(f.get("currency") ?? ""),
    };
    for (const k of TEXT_FIELDS) body[k] = String(f.get(k) ?? "").trim() || null; // empty clears the field
    const country = String(f.get("country") ?? "");
    if (country) body.country = country;
    const rate = Number(String(f.get("taxRate") ?? "").trim() || "0");
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setFields({ taxRateBps: "Between 0% and 100%" });
      return;
    }
    body.taxRateBps = Math.round(rate * 100); // percent in the form, basis points in the API
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await api("/company", { method: "PATCH", body });
      setNotice({ tone: "success", text: "Company details saved" });
      company.reload();
      await reloadSession(); // company name in the top bar
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      if (!Object.keys(byField).length) setNotice({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Company settings" subtitle="Details used on invoices and receipts, and your plan usage" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <form onSubmit={submit} noValidate key={c.id}>
            <div className="grid gap-x-5 md:grid-cols-2">
              <Field label="Company name" error={fields.name}>
                {(id) => <Input id={id} name="name" defaultValue={c.name} required />}
              </Field>
              <Field label="Legal name" error={fields.legalName}>
                {(id) => <Input id={id} name="legalName" defaultValue={c.legalName ?? ""} placeholder="As registered" />}
              </Field>
              <Field label="Tax ID / registration number" error={fields.taxId}>
                {(id) => <Input id={id} name="taxId" defaultValue={c.taxId ?? ""} />}
              </Field>
              <Field label="Billing email" error={fields.billingEmail}>
                {(id) => <Input id={id} name="billingEmail" type="email" defaultValue={c.billingEmail ?? ""} />}
              </Field>
              <Field label="Country" error={fields.country} hint="Decides the tax on your BMERC plan invoices">
                {(id) => (
                  <Select id={id} name="country" defaultValue={c.country ?? ""}>
                    {!c.country && <option value="">Choose a country…</option>}
                    {countries().map((x) => (
                      <option key={x.code} value={x.code}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Time zone" error={fields.timezone} hint="Used for dates on jobs and reports">
                {(id) => (
                  <Select id={id} name="timezone" defaultValue={c.timezone}>
                    {zones.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Billing address" error={fields.billingAddress}>
              {(id) => <Textarea id={id} name="billingAddress" defaultValue={c.billingAddress ?? ""} />}
            </Field>
            <h3 className="mb-1 mt-2 text-sm font-semibold text-navy">Repair invoices to your customers</h3>
            <p className="mb-3 text-xs text-muted">
              Used on new repair invoices. Invoices already issued keep the currency and rate they were made with. Now: {c.currency},{" "}
              {fmtTaxRate(c.taxRateBps)}.
            </p>
            <div className="grid gap-x-5 md:grid-cols-2">
              <Field label="Currency" error={fields.currency}>
                {(id) => (
                  <Select id={id} name="currency" defaultValue={c.currency}>
                    {currencies.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Tax rate (%)" error={fields.taxRateBps} hint="0 if you do not charge tax">
                {(id) => (
                  <Input id={id} name="taxRate" type="number" min={0} max={100} step={0.01} inputMode="decimal" defaultValue={c.taxRateBps / 100} />
                )}
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" busy={busy}>
                Save details
              </Button>
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-navy">Plan and usage</h2>
          {!usage.data ? (
            <Loading />
          ) : (
            <>
              <div className="my-2 text-2xl font-bold text-navy">{usage.data.plan?.name ?? "No plan"}</div>
              {[
                ["Jobs this month", usage.data.jobsThisMonth],
                ["Sites", usage.data.sites],
                ["Active users", usage.data.users],
              ].map(([label, u]) => {
                const { used, limit } = u as Usage["users"];
                return (
                  <div key={label as string} className="flex justify-between border-t border-line py-2 text-sm text-muted">
                    <span>{label as string}</span>
                    <b className={limit !== null && used >= limit ? "text-danger" : "text-navy"}>{fmtLimit(used, limit)}</b>
                  </div>
                );
              })}
              <p className="mt-2 text-xs text-muted">Inactive sites and deactivated users do not count.</p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
