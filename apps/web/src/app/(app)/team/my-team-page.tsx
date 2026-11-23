"use client";

import { ROLE_LABEL } from "@bmerc/shared";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { Team } from "@/lib/types";
import { ButtonLink, Card, Chip, ErrorState, Loading, PageHeader, Table } from "@/components/ui";

/** My team (technician app): who is on the team and how many jobs each holds. */
export function MyTeamPage() {
  const { me } = useSession();
  const team = useApi<Team>(me.teamId ? `/teams/${me.teamId}` : null);
  const back = (
    <ButtonLink href="/board" variant="secondary">
      Back to board
    </ButtonLink>
  );
  if (!me.teamId) {
    return (
      <>
        <PageHeader title="My team" actions={back} />
        <Card>You are not in a team yet. Ask your company admin to add you to one.</Card>
      </>
    );
  }
  if (team.error) return <ErrorState error={team.error} onRetry={team.reload} />;
  if (!team.data) return <Loading />;
  const t = team.data;
  const head = t.members.find((m) => m.id === t.headUserId);

  return (
    <>
      <PageHeader title="My team" subtitle={`${t.name} · ${t.site.name} · Head technician: ${head?.fullName ?? "Not assigned"}`} actions={back} />
      <Table
        rows={t.members}
        rowKey={(m) => m.id}
        empty="No technicians in this team"
        columns={[
          { header: "Technician", cell: (m) => (m.id === me.id ? `${m.fullName} (you)` : m.fullName) },
          { header: "Role", cell: (m) => (m.role ? ROLE_LABEL[m.role] : "—") },
          { header: "Open jobs", cell: (m) => m.jobsOpen },
          { header: "Completed (QC)", cell: (m) => m.jobsDone },
          { header: "Status", cell: (m) => (m.isActive ? <Chip tone="success">Active</Chip> : <Chip tone="neutral">Inactive</Chip>) },
        ]}
      />
    </>
  );
}
