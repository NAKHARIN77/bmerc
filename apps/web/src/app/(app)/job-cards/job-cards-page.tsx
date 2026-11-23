"use client";

import { ROLE_LABEL } from "@bmerc/shared";
import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { JobRow, Page, Technician } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { StatusChip } from "@/components/chips";
import { Alert, ButtonLink, Card, ErrorState, Loading, PageHeader, Select } from "@/components/ui";

/**
 * Technician job cards (prototype "teamboard"): every technician and the jobs they hold, plus the queue of
 * jobs nobody has taken yet, so whoever hands out work sees who is free before assigning.
 */
export function JobCardsPage() {
  const { can } = useSession();
  const allowed = can("company_admin", "site_manager", "head_technician");
  const techs = useApi<Technician[]>(allowed ? "/jobs/technicians" : null);
  const jobs = useApi<Page<JobRow>>(allowed ? "/jobs?active=true&limit=100" : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;

  const reload = () => {
    techs.reload();
    jobs.reload();
  };
  async function assign(job: JobRow, assigneeId: string) {
    setBusy(job.id);
    setError(null);
    try {
      await api(`/jobs/${job.id}/assign`, { method: "POST", body: { assigneeId } });
      reload();
    } catch (e) {
      setError(`${job.number}: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const all = jobs.data?.items ?? [];
  const queue = all.filter((j) => j.status === "todo" && !j.assignee);
  const list = techs.data ?? [];

  return (
    <>
      <PageHeader
        title="Technician job cards"
        subtitle="Every technician in your company and the job cards assigned to them"
        actions={
          <>
            {can("company_admin") && (
              <ButtonLink href="/technicians" variant="secondary">
                Technicians
              </ButtonLink>
            )}
            <ButtonLink href="/board" variant="secondary">
              Bench board
            </ButtonLink>
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      {techs.error || jobs.error ? (
        <ErrorState error={(techs.error ?? jobs.error)!} onRetry={reload} />
      ) : !techs.data || !jobs.data ? (
        <Loading />
      ) : (
        <>
          <Card className="mb-4 !bg-[#eef1f8]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <b className="text-base">Waiting for a technician</b>
                <div className="text-[13px] text-muted">Pick who takes each job. The number after each name is how many open jobs they already hold.</div>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy">{queue.length}</span>
            </div>
            {queue.length === 0 ? (
              <p className="text-sm text-muted">Every job has a technician.</p>
            ) : (
              <div className="flex items-start gap-4 overflow-x-auto pb-1">
                {queue.map((j) => {
                  const here = list.filter((t) => t.site.id === j.site.id).sort((a, b) => a.openJobs - b.openJobs);
                  return (
                    <div key={j.id} className={`w-[260px] flex-none ${busy === j.id ? "opacity-50" : ""}`}>
                      <div className="mb-1.5 text-xs text-muted">Site: {j.site.name}</div>
                      <MiniCard job={j}>
                        <div className="mt-2 text-xs text-muted">Received {fmtDate(j.receivedAt)}</div>
                        <Select aria-label={`Assign ${j.number}`} className="mt-2 h-9" value="" disabled={busy === j.id} onChange={(e) => e.target.value && assign(j, e.target.value)}>
                          <option value="">{here.length ? "Assign to technician..." : "No technician at this site"}</option>
                          {here.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName} · {t.openJobs} open
                            </option>
                          ))}
                        </Select>
                      </MiniCard>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          {list.length === 0 && <Card className="text-muted">No technicians in a team yet. Add technicians and put them in a team at a site.</Card>}
          {list.map((t) => {
            const mine = all.filter((j) => j.assignee?.id === t.id);
            return (
              <Card key={t.id} className="mb-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-base">{t.fullName}</b>
                    <div className="text-[13px] text-muted">
                      {t.role ? ROLE_LABEL[t.role] : "—"} · {t.team.name} · {t.site.name}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-full bg-[#eef1f8] px-2.5 py-1 text-xs font-semibold text-navy">{t.openJobs} open</span>
                    <span className="rounded-full bg-[#d1fae5] px-2.5 py-1 text-xs font-semibold text-success">{t.atQc} at QC</span>
                  </div>
                </div>
                {mine.length ? (
                  <div className="flex items-start gap-4 overflow-x-auto pb-1">
                    {mine.map((j) => (
                      <div key={j.id} className="w-[250px] flex-none">
                        <div className="mb-1.5 text-xs text-muted">Site: {j.site.name}</div>
                        <MiniCard job={j}>
                          <div className="mt-2">
                            <StatusChip status={j.status} />
                          </div>
                        </MiniCard>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No job cards assigned.</p>
                )}
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}

function MiniCard({ job: j, children }: { job: JobRow; children?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Link href={`/jobs/${j.id}`} className="text-xs font-semibold text-info hover:underline">
          {j.number}
        </Link>
        {(j.priority === "high" || j.priority === "urgent") && (
          <span className="rounded-full bg-[#fde8e8] px-2.5 py-1 text-[11px] font-semibold text-danger">{j.priority === "urgent" ? "URGENT" : "HIGH PRIORITY"}</span>
        )}
      </div>
      <div className="font-semibold text-navy">{j.device.model}</div>
      <div className="mb-1.5 mt-1 text-[13px] text-ink">{j.workNote || j.reportedFault}</div>
      <div className="text-xs text-muted">{j.customer.name}</div>
      {children}
    </div>
  );
}
