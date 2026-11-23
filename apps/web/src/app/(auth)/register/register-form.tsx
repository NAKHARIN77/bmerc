"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { countries } from "@bmerc/shared";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { AuthHeading, AuthLink, MIN_PASSWORD } from "../auth-form";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api("/auth/register", { method: "POST", body: f });
      router.replace("/setup");
    } catch (err) {
      const byField = err instanceof ApiError ? err.fieldErrors() : {};
      setFields(byField);
      setError(Object.keys(byField).length ? null : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading title="Register your company" subtitle="Create the admin account for your repair center" />
      {error && <Alert>{error}</Alert>}
      <Field label="Company name" error={fields.companyName}>
        {(id) => <Input id={id} name="companyName" placeholder="e.g. Siam Hash Repair Co." required autoFocus />}
      </Field>
      <Field label="Country" error={fields.country} hint="Where your company is registered. Decides the tax on your plan invoices">
        {(id) => (
          <Select id={id} name="country" defaultValue="" required>
            <option value="" disabled>
              Choose a country…
            </option>
            {countries().map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Full name" error={fields.fullName}>
        {(id) => <Input id={id} name="fullName" autoComplete="name" placeholder="e.g. Wilai Rattanakul" required />}
      </Field>
      <Field label="Company email" error={fields.email}>
        {(id) => <Input id={id} name="email" type="email" autoComplete="email" placeholder="admin@company.com" required />}
      </Field>
      <Field label="Password" error={fields.password} hint={`At least ${MIN_PASSWORD} characters`}>
        {(id) => <Input id={id} name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required />}
      </Field>
      <p className="mb-3 text-xs text-muted">Your company starts on the Basic plan. You can upgrade later from Company settings.</p>
      <Button type="submit" busy={busy} className="w-full">
        Create account
      </Button>
      <AuthLink href="/login">Back to log in</AuthLink>
    </form>
  );
}
