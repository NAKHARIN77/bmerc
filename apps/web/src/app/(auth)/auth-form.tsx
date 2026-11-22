"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";

export const MIN_PASSWORD = 8;

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-semibold text-navy">{title}</h2>
      {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mt-4 block text-center text-sm font-semibold text-info hover:underline">
      {children}
    </Link>
  );
}

/** Only same-site paths, so ?next= cannot send people to another domain. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/** New password + confirmation, shared by reset-password and accept-invite. */
export function SetPasswordForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: (password: string) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== f.get("confirm")) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "INVALID_TOKEN" ? "This link is invalid or has expired. Ask for a new one." : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
        {(id) => <Input id={id} name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus />}
      </Field>
      <Field label="Confirm new password">{(id) => <Input id={id} name="confirm" type="password" autoComplete="new-password" required />}</Field>
      <Button type="submit" busy={busy} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
