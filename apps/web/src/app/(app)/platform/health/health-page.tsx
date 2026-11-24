"use client";

import { useApi } from "@/lib/use-api";
import { fmtDateTime } from "@/lib/format";
import { Chip, ErrorState, Kpi, KpiRow, Loading, PageHeader, Table } from "@/components/ui";
import { OwnerOnly } from "../owner-only";

interface Health {
  apiStartedAt: string;
  uptimeSeconds: number;
  database: { ok: boolean; latencyMs: number; sizeBytes: number };
  last24h: { logins: number; failedLogins: number; auditEvents: number };
  mail: { configured: boolean; from: string | null };
  node: string;
}

const duration = (s: number) => (s < 3600 ? `${Math.floor(s / 60)} min` : s < 86_400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86_400).toFixed(1)} days`);
const size = (b: number) => (b < 1_048_576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1_048_576).toFixed(1)} MB`);

/**
 * Owner "Platform health", from real signals only: the API and database, sign-ins and activity.
 * Uptime history and error rates need a monitoring service (design doc section 9: Sentry, uptime check).
 */
export function HealthPage() {
  return (
    <OwnerOnly>
      <HealthView />
    </OwnerOnly>
  );
}

function HealthView() {
  const h = useApi<Health>("/platform/health");
  if (h.error) return <ErrorState error={h.error} onRetry={h.reload} />;
  if (!h.data) return <Loading />;
  const d = h.data;
  const failRate = d.last24h.logins + d.last24h.failedLogins ? Math.round((d.last24h.failedLogins * 100) / (d.last24h.logins + d.last24h.failedLogins)) : 0;
  return (
    <>
      <PageHeader title="Platform health" subtitle="System status, checked live when this page opens" />
      <KpiRow>
        <Kpi label="API running for" value={duration(d.uptimeSeconds)} caption={`Since ${fmtDateTime(d.apiStartedAt)}`} tone="success" icon="heart" />
        <Kpi label="Database response" value={`${d.database.latencyMs} ms`} caption={d.database.latencyMs < 100 ? "Normal" : "Slow"} tone={d.database.latencyMs < 100 ? "success" : "warn"} icon="heart" />
        <Kpi label="Failed sign-ins (24 h)" value={d.last24h.failedLogins} caption={`${failRate}% of sign-in attempts`} tone={failRate > 20 ? "danger" : "navy"} icon="shield" />
      </KpiRow>
      <Table
        rows={[
          { k: "API", v: `Running, Node ${d.node}`, ok: true },
          { k: "Database", v: `Connected, ${size(d.database.sizeBytes)}`, ok: d.database.ok },
          { k: "Sign-ins (24 h)", v: `${d.last24h.logins} successful, ${d.last24h.failedLogins} failed`, ok: failRate <= 20 },
          { k: "Audit log (24 h)", v: `${d.last24h.auditEvents} events recorded`, ok: true },
          { k: "Email", v: d.mail.configured ? `Sending from ${d.mail.from ?? "the default address"}` : "Not set up: invites and password resets are not emailed (set SMTP_URL)", ok: d.mail.configured },
          { k: "Error tracking and uptime history", v: "Not connected yet (Sentry and an uptime check, before launch)", ok: false },
        ]}
        rowKey={(r) => r.k}
        columns={[
          { header: "Check", cell: (r) => r.k },
          { header: "Result", cell: (r) => r.v },
          { header: "Status", cell: (r) => (r.ok ? <Chip tone="success">OK</Chip> : <Chip tone="warn">Waiting</Chip>) },
        ]}
      />
    </>
  );
}
