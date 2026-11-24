"use client";

import { useParams } from "next/navigation";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { limitText, usd, type PlatformCompanyDetail } from "@/lib/platform";
import { ButtonLink, Chip, ErrorState, Facts, Card, Kpi, KpiRow, Loading, PageHeader, Table } from "@/components/ui";
import { OwnerOnly } from "../../owner-only";

/** Prototype "Company sites": one company's sites with teams, technicians and open jobs. */
export function CompanyPage() {
  return (
    <OwnerOnly>
      <Company />
    </OwnerOnly>
  );
}

function Company() {
  const { id } = useParams<{ id: string }>();
  const c = useApi<PlatformCompanyDetail>(`/platform/companies/${id}`);
  const back = (
    <ButtonLink href="/dashboard" variant="secondary">
      Back to companies
    </ButtonLink>
  );
  if (c.error) return <ErrorState error={c.error} onRetry={c.reload} />;
  if (!c.data) return <Loading />;
  const d = c.data;
  const teams = d.sites.reduce((a, s) => a + s.teams, 0);
  const techs = d.sites.reduce((a, s) => a + s.technicians, 0);
  return (
    <>
      <PageHeader
        title={d.name}
        subtitle="Sites of this company, with teams and technician counts"
        actions={
          <>
            {back}
            <ButtonLink href={`/platform/quotas/${d.id}`}>View plan</ButtonLink>
          </>
        }
      />
      <KpiRow>
        <Kpi label="Sites" value={d.sites.length} caption="Registered locations" icon="pin" />
        <Kpi label="Teams" value={teams} caption="Across all sites" tone="info" icon="users" />
        <Kpi label="Technicians" value={techs} caption="Across all sites" tone="success" icon="users" />
      </KpiRow>
      <Table
        rows={d.sites}
        rowKey={(s) => s.id}
        empty="This company has no sites yet"
        columns={[
          { header: "Site", cell: (s) => s.name },
          { header: "Country", cell: (s) => s.country ?? "—" },
          { header: "City / Province", cell: (s) => s.province ?? "—" },
          { header: "Teams", cell: (s) => s.teams },
          { header: "Technicians", cell: (s) => s.technicians },
          { header: "Open jobs", emphasis: true, cell: (s) => s.openJobs },
        ]}
      />
      <Card className="mt-4">
        <b className="text-base">Company</b>
        <div className="mt-4">
          <Facts
            cols={3}
            items={[
              ["Legal name", d.legalName ?? "—"],
              ["Country", d.country ?? "—"],
              ["Billing email", d.billingEmail ?? "—"],
              ["Plan", d.subscription ? `${d.subscription.plan.name} · ${usd(d.subscription.plan.priceCents)} / month` : "—"],
              ["Access", d.status === "active" ? <Chip key="a" tone="success">Active</Chip> : <Chip key="a" tone="danger">{d.status === "suspended" ? "Suspended" : "Closed"}</Chip>],
              ["Signed up", fmtDate(d.createdAt)],
              ["Credits this month", limitText(d.usage.creditsThisMonth, d.limits.jobsPerMonth)],
              ["Sites", limitText(d.usage.sites, d.limits.sites)],
              ["Users", limitText(d.usage.users, d.limits.users)],
            ]}
          />
        </div>
      </Card>
    </>
  );
}
