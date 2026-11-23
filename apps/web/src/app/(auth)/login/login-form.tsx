"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import { AuthHeading, AuthLink, safeNext } from "../auth-form";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading title="Log in" subtitle="Use your company email and password" />
      {error && <Alert>{error}</Alert>}
      <Field label="Company email">{(id) => <Input id={id} name="email" type="email" autoComplete="email" placeholder="name@company.com" required autoFocus />}</Field>
      <Field label="Password">{(id) => <Input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
      <Button type="submit" busy={busy} className="mt-2 w-full">
        Log in
      </Button>
      <AuthLink href="/register">Register your company</AuthLink>
      <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
    </form>
  );
}
