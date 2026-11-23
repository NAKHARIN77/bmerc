"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Prototype "Change password". Changing it signs out every session, this one included,
 * so the user logs in again with the new password.
 */
export function ChangePasswordPage() {
  const { logout } = useSession();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const currentPassword = String(f.get("currentPassword") ?? "");
    const newPassword = String(f.get("newPassword") ?? "");
    setError(null);
    setFields({});
    if (newPassword !== String(f.get("confirm") ?? "")) {
      setFields({ confirm: "The two new passwords do not match" });
      return;
    }
    if (newPassword === currentPassword) {
      setFields({ newPassword: "Choose a password you have not used here" });
      return;
    }
    setBusy(true);
    try {
      await api("/me/password", { method: "PATCH", body: { currentPassword, newPassword } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "WRONG_PASSWORD") setFields({ currentPassword: err.message });
      else {
        const byField = err instanceof ApiError ? err.fieldErrors() : {};
        setFields(byField);
        setError(Object.keys(byField).length ? null : errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-[420px] rounded-xl bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      <h1 className="mb-1.5 text-2xl font-semibold text-navy">Change password</h1>
      {done ? (
        <>
          <p className="mb-5 text-muted">Your password has been changed. For your safety you are signed out everywhere; log in again with the new password.</p>
          <Button className="w-full" onClick={() => void logout()}>
            Log in again
          </Button>
        </>
      ) : (
        <>
          <p className="mb-5 text-muted">Set a new password for your account</p>
          {error && <Alert>{error}</Alert>}
          <form onSubmit={submit} noValidate>
            <Field label="Current password" error={fields.currentPassword}>
              {(id) => <Input id={id} name="currentPassword" type="password" autoComplete="current-password" required autoFocus />}
            </Field>
            <Field label="New password" error={fields.newPassword} hint="At least 8 characters">
              {(id) => <Input id={id} name="newPassword" type="password" autoComplete="new-password" minLength={8} required />}
            </Field>
            <Field label="Confirm new password" error={fields.confirm}>
              {(id) => <Input id={id} name="confirm" type="password" autoComplete="new-password" required />}
            </Field>
            <Button type="submit" className="mt-2 w-full" busy={busy}>
              Update password
            </Button>
          </form>
          <Link href="/dashboard" className="mt-4 block text-center font-semibold text-info hover:underline">
            Back
          </Link>
        </>
      )}
    </div>
  );
}
