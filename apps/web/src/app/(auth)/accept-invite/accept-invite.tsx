"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert, Loading } from "@/components/ui";
import { AuthHeading, AuthLink, SetPasswordForm } from "../auth-form";

interface InviteInfo {
  email: string;
  fullName: string;
  companyName: string | null;
}

export function AcceptInvite() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [bad, setBad] = useState(!token);

  useEffect(() => {
    if (!token) return;
    api<InviteInfo>(`/auth/invites/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setBad(true));
  }, [token]);

  if (bad) {
    return (
      <div>
        <AuthHeading title="Invite link not valid" />
        <Alert>This invite has expired, was already used, or was replaced by a newer one. Ask your company admin to send it again.</Alert>
        <AuthLink href="/login">Go to log in</AuthLink>
      </div>
    );
  }
  if (!info) return <Loading />;

  return (
    <div>
      <AuthHeading
        title={`Welcome, ${info.fullName}`}
        subtitle={
          <>
            Set a password to join <b className="text-ink">{info.companyName ?? "BMERC"}</b> as {info.email}.
          </>
        }
      />
      <SetPasswordForm
        submitLabel="Set password and sign in"
        onSubmit={async (password) => {
          await api("/auth/accept-invite", { method: "POST", body: { token, password } });
          router.replace("/dashboard");
        }}
      />
    </div>
  );
}
