"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthHeading, AuthLink } from "../auth-form";

export function ForgotForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSentTo(email);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div>
        <AuthHeading title="Check your email" />
        {/* Same message whether or not the account exists, matching the API. */}
        <p className="text-muted">
          If an account exists for <b className="text-ink">{sentTo}</b>, we sent a link to reset the password. The link works for 1 hour.
        </p>
        <AuthLink href="/login">Back to log in</AuthLink>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading title="Forgot your password?" subtitle="Enter your work email and we will send you a reset link" />
      {error && <Alert>{error}</Alert>}
      <Field label="Email">{(id) => <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />}</Field>
      <Button type="submit" busy={busy} className="w-full">
        Send reset link
      </Button>
      <AuthLink href="/login">Back to log in</AuthLink>
    </form>
  );
}
