"use client";

import { ROLE_LABEL, SITE_ROLES } from "@bmerc/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, errorMessage, INVITE_EMAIL_FAILED } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Site, Team, UserRow } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, CellLink, Chip, ErrorState, Loading, PageHeader, SearchBar, Table } from "@/components/ui";

export function UsersPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const isAdmin = can("company_admin");
  const allowed = can("company_admin", "site_manager");
  const users = useApi<UserRow[]>(allowed ? "/users" : null);
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  const teams = useApi<Team[]>(allowed ? "/teams" : null);
  // The invite form sends ?mail=failed when the person was saved but their email did not go out.
  const mailFailed = useSearchParams().get("mail") === "failed";
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(mailFailed ? { tone: "danger", text: INVITE_EMAIL_FAILED } : null);
  const [q, setQ] = useState("");

  const siteName = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s.name])), [sites.data]);
  // Job counts per technician come with the team list.
  const counts = useMemo(() => new Map((teams.data ?? []).flatMap((t) => t.members.map((m) => [m.id, m] as const))), [teams.data]);

  if (!allowed) return <NoAccess />;

  async function act(label: string, run: () => Promise<unknown>) {
    setNotice(null);
    try {
      const res = await run();
      const failed = !!res && typeof res === "object" && (res as { emailSent?: boolean }).emailSent === false;
      setNotice(failed ? { tone: "danger", text: INVITE_EMAIL_FAILED } : { tone: "success", text: label });
      users.reload();
    } catch (e) {
      setNotice({ tone: "danger", text: errorMessage(e) });
    }
  }

  const term = q.trim().toLowerCase();
  const rows = (users.data ?? []).filter((u) => !term || u.fullName.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={isAdmin ? "Everyone in your company and the jobs assigned to them. New people get an email invite" : "Staff in teams at your sites"}
        actions={isAdmin && <ButtonLink href="/users/new">+ Add user</ButtonLink>}
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <SearchBar value={q} onChange={setQ} placeholder="Search by name or email" />
      {users.error ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : !users.data ? (
        <Loading />
      ) : (
        <Table
          rows={rows}
          rowKey={(u) => u.id}
          onRowClick={isAdmin ? (u) => router.push(`/users/${u.id}/edit`) : undefined}
          empty={term ? "No users match" : "No users yet"}
          columns={[
            {
              header: "Name",
              cell: (u) => (
                <div>
                  {isAdmin ? <CellLink href={`/users/${u.id}/edit`}>{u.fullName}</CellLink> : <span className="font-semibold text-ink">{u.fullName}</span>}
                  {u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
              ),
            },
            { header: "Role", cell: (u) => (u.role ? ROLE_LABEL[u.role] : "—") },
            {
              header: "Team / sites",
              cell: (u) =>
                u.role && SITE_ROLES.includes(u.role)
                  ? u.siteIds.map((id) => siteName.get(id) ?? "Unknown site").join(", ") || "—"
                  : u.team
                    ? u.team.name
                    : u.role === "company_admin"
                      ? "All sites"
                      : "—",
            },
            { header: "Open jobs", cell: (u) => counts.get(u.id)?.jobsOpen ?? "—" },
            { header: "Completed (QC)", cell: (u) => counts.get(u.id)?.jobsDone ?? "—" },
            {
              header: "Status",
              cell: (u) => (!u.isActive ? <Chip>Inactive</Chip> : u.status === "invited" ? <Chip tone="warn">Invited</Chip> : <Chip tone="success">Active</Chip>),
            },
            { header: "Last login", className: "whitespace-nowrap", cell: (u) => fmtDateTime(u.lastLoginAt) },
            ...(isAdmin
              ? [
                  {
                    header: "",
                    className: "text-right whitespace-nowrap",
                    cell: (u: UserRow) => (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {u.status === "invited" && u.isActive && (
                          <Button variant="secondary" className="h-8" onClick={() => act(`Invite sent again to ${u.email}`, () => api(`/users/${u.id}/resend-invite`, { method: "POST" }))}>
                            Resend invite
                          </Button>
                        )}
                        {u.id !== me.id &&
                          (u.isActive ? (
                            <Button variant="danger" className="h-8" onClick={() => act(`${u.fullName} was deactivated and signed out`, () => api(`/users/${u.id}/deactivate`, { method: "POST" }))}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="secondary" className="h-8" onClick={() => act(`${u.fullName} can log in again`, () => api(`/users/${u.id}/activate`, { method: "POST" }))}>
                              Activate
                            </Button>
                          ))}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}
