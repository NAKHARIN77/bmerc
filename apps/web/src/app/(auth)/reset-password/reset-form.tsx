"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui";
import { AuthHeading, AuthLink, SetPasswordForm } from "../auth-form";

export function ResetForm() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div>
        <AuthHeading title="Reset password" />
        <Alert>This link is missing its code. Open the link from the email again, or ask for a new one.</Alert>
        <AuthLink href="/forgot-password">Send a new link</AuthLink>
      </div>
    );
  }
  if (done) {
    return (
      <div>
        <AuthHeading title="Password changed" subtitle="You were signed out on every device. Log in with the new password." />
        <AuthLink href="/login">Log in</AuthLink>
      </div>
    );
  }
  return (
    <div>
      <AuthHeading title="Choose a new password" />
      <SetPasswordForm
        submitLabel="Save new password"
        onSubmit={async (password) => {
          await api("/auth/reset-password", { method: "POST", body: { token, password } });
          setDone(true);
        }}
      />
      <AuthLink href="/forgot-password">Send a new link</AuthLink>
    </div>
  );
}
