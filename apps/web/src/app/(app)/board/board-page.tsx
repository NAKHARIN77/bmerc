"use client";

import type { JobStatus } from "@bmerc/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fmtDate } from "@/lib/format";
import { qs } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";
import type { Assignee, JobRow, Page, Site, Team } from "@/lib/types";
import { NoAccess } from "@/components/app-shell";
import { Alert, Button, ButtonLink, Card, PageHeader, Select, Textarea } from "@/components/ui";

const COLS: Array<[Exclude<JobStatus, "dispatched">, string]> = [
  ["todo", "To Do (Queued)"],
  ["in_repair", "In Repair"],
  ["waiting_parts", "Waiting for Parts"],
  ["unrepairable", "Cannot Repair"],
  ["qc_passed", "Completed / QC"],
];
// Same rules as the API (design doc section 6); checked here only so a bad drop is refused without a round trip.
const NEXT: Record<JobStatus, JobStatus[]> = {
  todo: ["in_repair"],
  in_repair: ["waiting_parts", "qc_passed", "unrepairable"],
  waiting_parts: ["in_repair"],
  unrepairable: ["dispatched"],
  qc_passed: ["dispatched"],
  dispatched: [],
};
/** "Antminer S19j Pro" → "Antminer S19 Series": the prototype's model filter chips. */
const series = (model: string) => {
  const [brand, name] = model.split(/\s+/);
  const base = name?.match(/^[A-Za-z]+\d+[A-Za-z]?/)?.[0];
  return base ? `${brand} ${base.replace(/[a-z]$/, "")} Series` : model;
};
const stop = (e: MouseEvent) => e.stopPropagation();

type Ask = { job: JobRow; to: "waiting_parts" | "unrepairable" };
type Move = (job: JobRow, to: JobStatus, extra?: Record<string, string>) => Promise<boolean>;

/** Technician Bench Board (prototype "My jobs"): open jobs by stage. Drag a card or use its buttons. */
export function BoardPage() {
  const { me, can } = useSession();
  const router = useRouter();
  const [who, setWho] = useState(""); // "" = everyone, or a user id
  const [model, setModel] = useState("");
  const [highFirst, setHighFirst] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [people, setPeople] = useState<Record<string, Assignee[]>>({});

  const allowed = !!me.role && me.role !== "stock_keeper";
  const sites = useApi<Site[]>(allowed ? "/sites" : null);
  const team = useApi<Team>(allowed && me.teamId ? `/teams/${me.teamId}` : null);
  const jobs = useApi<Page<JobRow>>(allowed ? `/jobs${qs({ active: "true", limit: 100 })}` : null);
  const canAssign = can("company_admin", "site_manager", "head_technician");
  const canDispatch = canAssign;

  // Technicians each site can hand a To Do card to (prototype: "Assign to technician..." on the card).
  const siteKey = [...new Set((jobs.data?.items ?? []).filter((j) => j.status === "todo").map((j) => j.site.id))].sort().join(",");
  useEffect(() => {
    if (!canAssign || !siteKey) return;
    let live = true;
    Promise.all(siteKey.split(",").map(async (id) => [id, await api<Assignee[]>(`/jobs/assignees?siteId=${id}`)] as const))
      .then((pairs) => live && setPeople(Object.fromEntries(pairs)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [canAssign, siteKey]);

  if (!allowed) return <NoAccess />;

  const all = jobs.data?.items ?? [];
  const techs = [...new Map(all.filter((j) => j.assignee).map((j) => [j.assignee!.id, j.assignee!.fullName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const models = [...new Set(all.map((j) => series(j.device.model)))].sort();
  const rank = (j: JobRow) => (j.priority === "urgent" ? 0 : j.priority === "high" ? 1 : 2);
  const shown = all
    .filter((j) => (who ? j.assignee?.id === who : true) && (model ? series(j.device.model) === model : true))
    .sort((a, b) => (highFirst ? rank(a) - rank(b) : 0));
  const count = (s: JobStatus) => shown.filter((j) => j.status === s).length;
  const done = shown.filter((j) => j.qcPassedAt);
  const tat = done.length ? done.reduce((a, j) => a + (Date.parse(j.qcPassedAt!) - Date.parse(j.receivedAt)), 0) / done.length / 3_600_000 : null;

  const move: Move = async (job, to, extra) => {
    setError(null);
    if (!NEXT[job.status].includes(to)) {
      setError(`${job.number} cannot move straight to that column.`);
      return false;
    }
    setBusy(job.id);
    try {
      await api(`/jobs/${job.id}/transition`, { method: "POST", body: { to, ...extra } });
      jobs.reload();
      return true;
    } catch (e) {
      setError(`${job.number}: ${errorMessage(e)}`);
      jobs.reload();
      return false;
    } finally {
      setBusy(null);
    }
  };
  const askFor = (job: JobRow, to: Ask["to"]) => {
    if (!NEXT[job.status].includes(to)) return setError(`${job.number} cannot move straight to that column.`);
    setNote("");
    setAsk({ job, to });
  };
  async function assign(job: JobRow, assigneeId: string) {
    setError(null);
    try {
      await api(`/jobs/${job.id}/assign`, { method: "POST", body: { assigneeId } });
      jobs.reload();
    } catch (e) {
      setError(`${job.number}: ${errorMessage(e)}`);
    }
  }

  function drop(e: DragEvent, to: JobStatus) {
    e.preventDefault();
    setOver(null);
    const job = all.find((j) => j.id === e.dataTransfer.getData("text/plain"));
    if (!job || job.status === to) return;
    if (to === "waiting_parts" || to === "unrepairable") return askFor(job, to);
    void move(job, to);
  }

  const place = me.teamId && team.data ? `${team.data.name} · ${team.data.site.name}` : sites.data?.length === 1 ? sites.data[0].name : "All sites";
  const chip = (on: boolean) => `h-9 rounded-full px-3.5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,.05)] ${on ? "bg-primary text-white" : "bg-white text-navy hover:bg-field"}`;

  return (
    <>
      <PageHeader
        title="Technician Bench Board"
        subtitle={`${place} · Drag a job card to move it to another stage`}
        actions={
          <>
            {canAssign && (
              <ButtonLink href="/job-cards" variant="secondary">
                Technician job cards
              </ButtonLink>
            )}
            <ButtonLink href={canAssign ? "/jobs/new" : "/scan"} variant="secondary">
              + New Diagnosis / Scan Ticket
            </ButtonLink>
            <ButtonLink href="/scan">Scan Miner QR</ButtonLink>
          </>
        }
      />
      <Card className="mb-4 flex flex-wrap gap-x-8 gap-y-2 !py-3.5">
        <span>
          Assigned: <b>{shown.filter((j) => j.assignee).length}</b>
        </span>
        <span>
          In repair: <b>{count("in_repair")}</b>
        </span>
        <span>
          Waiting for parts: <b>{count("waiting_parts")}</b>
        </span>
        <span>
          Avg TAT: <b>{tat === null ? "—" : `${tat.toFixed(1)} hrs`}</b>
        </span>
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[200px]">
          <Select aria-label="Technician" className="h-9 bg-white" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">All technicians</option>
            {techs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <button className={chip(model === "")} onClick={() => setModel("")}>
          All miners
        </button>
        {models.map((m) => (
          <button key={m} className={chip(model === m)} onClick={() => setModel(model === m ? "" : m)}>
            {m}
          </button>
        ))}
        <button className={chip(highFirst)} onClick={() => setHighFirst((v) => !v)} aria-pressed={highFirst}>
          Priority: High first
        </button>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {ask && (
        <Card className="mb-4 max-w-[640px]">
          <b>
            {ask.job.number} → {ask.to === "waiting_parts" ? "Waiting for Parts" : "Cannot Repair"}
          </b>
          <label htmlFor="ask-note" className="mb-1.5 mt-3 block text-xs font-medium text-muted">
            {ask.to === "waiting_parts" ? "Which parts are you waiting for?" : "Why can it not be repaired? (required)"}
          </label>
          <Textarea id="ask-note" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <div className="mt-2 flex gap-2.5">
            <Button
              busy={busy === ask.job.id}
              onClick={async () => {
                if (await move(ask.job, ask.to, ask.to === "unrepairable" ? { reason: note } : { note })) setAsk(null);
              }}
            >
              Save
            </Button>
            <Button variant="secondary" onClick={() => setAsk(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {COLS.map(([status, label]) => {
          const items = shown.filter((j) => j.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => drop(e, status)}
              className={`min-w-[200px] flex-1 basis-0 rounded-xl p-3 transition-colors ${over === status ? "bg-[#dfe7f7]" : "bg-[#eef1f8]"}`}
            >
              <div className="mb-3 flex items-center justify-between font-semibold text-navy">
                <span>{label}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs">{items.length}</span>
              </div>
              {jobs.data === undefined && <p className="text-sm text-muted">Loading…</p>}
              {items.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  busy={busy === j.id}
                  open={() => router.push(`/jobs/${j.id}`)}
                  move={move}
                  askFor={askFor}
                  assignees={canAssign ? people[j.site.id] : undefined}
                  assign={assign}
                  canDispatch={canDispatch}
                  saved={jobs.reload}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted">
        Jobs returned to customers leave the board. Find them in{" "}
        <Link href="/jobs" className="text-info">
          Jobs
        </Link>
        .
      </p>
    </>
  );
}

function JobCard(props: {
  job: JobRow;
  busy: boolean;
  open: () => void;
  move: Move;
  askFor: (j: JobRow, to: Ask["to"]) => void;
  assignees?: Assignee[];
  assign: (j: JobRow, id: string) => void;
  canDispatch: boolean;
  saved: () => void;
}) {
  const { job: j, busy, move, askFor, canDispatch } = props;
  const technician = useSession().me.role === "technician"; // technicians ask the stock keeper on the Record test page
  const test = j.tests[0];
  const printed = j.qrPrintLogs[0];
  const btn = "mt-2 h-9 w-full";
  const working = j.status === "in_repair" || j.status === "waiting_parts";
  let extra: ReactNode = null;
  if (j.status === "todo")
    extra = (
      <Button className={btn} busy={busy} onClick={(e) => (stop(e), void move(j, "in_repair"))}>
        Start Repair
      </Button>
    );
  else if (j.status === "unrepairable")
    extra = (
      <>
        <div className="my-2.5 text-xs font-semibold text-danger">Cannot be repaired. Reason logged. Waiting for admin to confirm return to customer.</div>
        {canDispatch && (
          <Button className={btn} busy={busy} onClick={(e) => (stop(e), void move(j, "dispatched"))}>
            Confirm return to customer
          </Button>
        )}
      </>
    );
  else if (j.status === "in_repair")
    extra = (
      <>
        <Button className={btn} busy={busy} onClick={(e) => (stop(e), void move(j, "qc_passed"))}>
          Close Job (Pass to QC)
        </Button>
        {technician ? (
          <span className="block" onClick={stop}>
            <ButtonLink href={`/jobs/${j.id}/test#parts`} variant="secondary" className={btn} icon="wrench">
              Request Parts
            </ButtonLink>
          </span>
        ) : (
          <Button className={btn} variant="secondary" onClick={(e) => (stop(e), askFor(j, "waiting_parts"))}>
            Request Parts
          </Button>
        )}
      </>
    );
  else if (j.status === "waiting_parts")
    extra = (
      <>
        <div className="my-2.5 text-xs text-muted">Awaiting parts from {j.site.name} stock</div>
        <span className="block" onClick={stop}>
          <ButtonLink href="/stock" variant="secondary" className="h-9 w-full">
            Check Stock Status
          </ButtonLink>
        </span>
        <Button className={btn} variant="secondary" busy={busy} onClick={(e) => (stop(e), void move(j, "in_repair"))}>
          Parts arrived
        </Button>
      </>
    );
  else if (j.status === "qc_passed")
    extra = (
      <>
        <div className="my-2.5 text-xs font-semibold text-success">QC passed</div>
        {canDispatch && (
          <Button className={btn} busy={busy} onClick={(e) => (stop(e), void move(j, "dispatched"))}>
            Ready for Customer Dispatch
          </Button>
        )}
      </>
    );

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", j.id)}
      onClick={props.open}
      className={`mb-3 cursor-grab rounded-[10px] bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,99,152,.2)] ${busy ? "opacity-50" : ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-info">{j.number}</span>
        {(j.priority === "high" || j.priority === "urgent") && (
          <span className="rounded-full bg-[#fde8e8] px-2.5 py-1 text-[11px] font-semibold text-danger">{j.priority === "urgent" ? "URGENT" : "HIGH PRIORITY"}</span>
        )}
      </div>
      <div className="font-semibold text-navy">{j.device.model}</div>
      <div className="mb-1.5 mt-1 text-[13px] text-ink">{j.reportedFault}</div>
      <div className="text-xs text-muted">{j.customer.name}</div>
      {test && (
        <div className="mt-1.5 text-xs font-semibold text-navy">
          Test: {test.passed ? "Pass" : "Fail"} on {fmtDate(test.testedOn)}
        </div>
      )}
      {j.status === "qc_passed" && (
        <>
          <div className="my-2.5">
            {printed ? (
              <span className="inline-block rounded-full bg-[#d1fae5] px-2.5 py-1 text-xs font-semibold text-success">Printed {fmtDate(printed.printedAt)}</span>
            ) : (
              <span className="rounded-full bg-[#fef3c7] px-2.5 py-1 text-xs font-semibold text-warn">Label not printed</span>
            )}
          </div>
          <span className="block" onClick={stop}>
            <ButtonLink href={`/devices/${j.device.id}/label?job=${j.id}`} variant="secondary" className="h-9 w-full">
              Print QR Label
            </ButtonLink>
          </span>
        </>
      )}
      {j.status === "todo" && (
        <>
          <div className="mt-2.5 text-xs text-muted">
            Assigned to: <b>{j.assignee?.fullName ?? "Not assigned"}</b>
          </div>
          {props.assignees && (
            <Select aria-label="Assign to technician" className="mt-1.5 h-9" value="" onClick={stop} onChange={(e) => e.target.value && props.assign(j, e.target.value)}>
              <option value="">Assign to technician...</option>
              {props.assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} · {a.openJobs} open
                </option>
              ))}
            </Select>
          )}
        </>
      )}
      {working && <RepairNote job={j} saved={props.saved} />}
      {working && (
        <span className="block" onClick={stop}>
          <ButtonLink href={`/jobs/${j.id}/test`} variant="secondary" className="mt-2.5 h-8 w-full">
            Record test
          </ButtonLink>
        </span>
      )}
      {extra}
    </div>
  );
}

/** "Currently repairing": the technician's note, saved when the box loses focus. */
function RepairNote({ job: j, saved }: { job: JobRow; saved: () => void }) {
  const [text, setText] = useState(j.workNote ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  return (
    <div onClick={stop}>
      <div className="mt-2.5 text-xs font-semibold text-muted">Currently repairing</div>
      <textarea
        aria-label={`Repair note for ${j.number}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={async () => {
          if (text === (j.workNote ?? "")) return;
          setState("saving");
          try {
            await api(`/jobs/${j.id}/note`, { method: "PATCH", body: { workNote: text } });
            setState("idle");
            saved();
          } catch {
            setState("error");
          }
        }}
        placeholder="Technician: write what you are repairing"
        className="mt-1.5 h-[60px] w-full resize-none rounded-lg border-0 bg-field px-2.5 py-2 text-[13px] outline-none focus:ring-2 focus:ring-info/40"
      />
      {state === "saving" && <div className="text-[11px] text-muted">Saving…</div>}
      {state === "error" && <div className="text-[11px] text-danger">Not saved. Only the assigned technician can write here.</div>}
    </div>
  );
}
