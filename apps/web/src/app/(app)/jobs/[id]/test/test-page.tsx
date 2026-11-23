"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { qs } from "@/lib/use-debounced";
import type { Assignee, ComponentResult, JobDetail, JobRow, Page, StockPage, TestItem, TestValue } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, ErrorState, Field, Input, Loading, PageHeader, Select, Table, Textarea } from "@/components/ui";

const ITEMS: Array<[TestItem, string]> = [
  ["hb1", "Hashboard 1"],
  ["hb2", "Hashboard 2"],
  ["hb3", "Hashboard 3"],
  ["ctrl", "Control board"],
  ["psu", "Power supply"],
  ["fan", "Cooling fans"],
];
const VALUE_LABEL: Record<TestValue, string> = { not_tested: "Not tested", pass: "Pass", fail: "Fail" };
const today = () => new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd in local time

/** Test record (technician): results per board before QC, plus the boards and parts used on the job. */
export function TestPage() {
  const { id } = useParams<{ id: string }>();
  const job = useApi<JobDetail>(`/jobs/${id}`);
  if (job.error) return <ErrorState error={job.error} onRetry={job.reload} />;
  if (!job.data) return <Loading />;
  return <TestForm key={job.data.id} job={job.data} reload={job.reload} />;
}

function TestForm({ job: j, reload }: { job: JobDetail; reload: () => void }) {
  const router = useRouter();
  const { me, can } = useSession();
  const last = j.tests[0];
  const [testedOn, setTestedOn] = useState(today());
  const [testedBy, setTestedBy] = useState(me.id);
  const [work, setWork] = useState(last?.workDone ?? j.workNote ?? "");
  const [results, setResults] = useState<Record<TestItem, TestValue>>(last?.results ?? { hb1: "not_tested", hb2: "not_tested", hb3: "not_tested", ctrl: "not_tested", psu: "not_tested", fan: "not_tested" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lead = can("company_admin", "site_manager", "head_technician");
  const people = useApi<Assignee[]>(lead ? `/jobs/assignees?siteId=${j.site.id}` : null);
  const open = useApi<Page<JobRow>>(`/jobs${qs({ active: "true", limit: 100 })}`);
  const jobs = (open.data?.items ?? []).filter((x) => (x.status === "in_repair" || x.status === "waiting_parts") && (lead || x.assignee?.id === me.id));
  const testable = j.can.work && (j.status === "in_repair" || j.status === "waiting_parts");
  const allPass = Object.values(results).every((v) => v === "pass");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ passed: boolean; status: string }>(`/jobs/${j.id}/tests`, {
        method: "POST",
        body: { testedOn, testedById: testedBy === me.id ? undefined : testedBy, workDone: work, results },
      });
      router.push(r.status === "qc_passed" ? `/devices/${j.device.id}/label?job=${j.id}` : "/board");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const testers = [{ id: me.id, fullName: me.fullName }, ...(people.data ?? []).filter((p) => p.id !== me.id)];

  return (
    <>
      <PageHeader
        title={`Test record: ${j.number}`}
        subtitle={`${j.device.model} · ${j.customer.name} · Record test results before QC`}
        actions={
          <ButtonLink href="/board" variant="secondary">
            Back to board
          </ButtonLink>
        }
      />
      {!testable && (
        <div className="mb-4">
          <Alert tone="warn">{j.status === "todo" ? "Start the repair before recording a test." : "This job is not in repair, so it cannot be tested."}</Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <Field label="Job">
            {(fid) => (
              <Select id={fid} value={j.id} onChange={(e) => router.push(`/jobs/${e.target.value}/test`)}>
                {!jobs.some((x) => x.id === j.id) && (
                  <option value={j.id}>
                    {j.number} · {j.device.model}
                  </option>
                )}
                {jobs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.number} · {x.device.model}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Test date">{(fid) => <Input id={fid} type="date" value={testedOn} max={today()} onChange={(e) => setTestedOn(e.target.value)} />}</Field>
            <Field label="Tested by">
              {(fid) => (
                <Select id={fid} value={testedBy} onChange={(e) => setTestedBy(e.target.value)}>
                  {testers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Work done (parts replaced or changed)">
            {(fid) => <Textarea id={fid} value={work} onChange={(e) => setWork(e.target.value)} placeholder="e.g. Replaced 3 BM1398 chips on hashboard 1" />}
          </Field>
        </Card>
        <Card>
          <b className="text-base">Test results</b>
          <div className="mt-2">
            {ITEMS.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between border-b border-soft py-2.5">
                <span>{label}</span>
                <div className="w-[140px] flex-none">
                  <Select aria-label={label} className="h-9" value={results[k]} onChange={(e) => setResults((r) => ({ ...r, [k]: e.target.value as TestValue }))}>
                    {(["not_tested", "pass", "fail"] as const).map((v) => (
                      <option key={v} value={v}>
                        {VALUE_LABEL[v]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">If every item is Pass, the job moves to Completed / QC. Any Fail sends it back to In Repair.</p>
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button busy={busy} disabled={!testable} onClick={save}>
              {allPass ? "Save test and print label" : "Save test"}
            </Button>
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Boards job={j} editable={j.can.work && j.status !== "todo"} reload={reload} />
        <Parts job={j} reload={reload} />
      </div>
    </>
  );
}

type Comp = { component: string; serialNo: string; replacementSerialNo: string; workDone: string; result: ComponentResult };
const blank = (): Comp => ({ component: "", serialNo: "", replacementSerialNo: "", workDone: "", result: "repaired" });

/** Serials of the boards worked on, so a board sent in alone later still shows its history. */
function Boards({ job: j, editable, reload }: { job: JobDetail; editable: boolean; reload: () => void }) {
  const [rows, setRows] = useState<Comp[]>(() =>
    j.components.length
      ? j.components.map((c) => ({ component: c.component, serialNo: c.serialNo ?? "", replacementSerialNo: c.replacementSerialNo ?? "", workDone: c.workDone ?? "", result: c.result }))
      : [blank()],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, k: keyof Comp, v: string) => setRows((r) => r.map((x, n) => (n === i ? { ...x, [k]: v } : x)));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/jobs/${j.id}/components`, {
        method: "PUT",
        body: rows.filter((r) => r.component.trim()).map((r) => ({ ...r, serialNo: r.serialNo || null, replacementSerialNo: r.replacementSerialNo || null, workDone: r.workDone || null })),
      });
      setMsg({ ok: true, text: "Saved" });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <b className="text-base">Boards worked on</b>
      <p className="mb-3 mt-1 text-xs text-muted">Write the serial of each board. If you fitted a new board, add its serial too, so its history can be found later.</p>
      {rows.map((r, i) => (
        <div key={i} className="mb-3 grid gap-2 rounded-lg bg-[#f6f8ff] p-3 sm:grid-cols-2">
          <Input aria-label="Component" placeholder="e.g. Hashboard 2" value={r.component} disabled={!editable} onChange={(e) => set(i, "component", e.target.value)} />
          <Select aria-label="Result" value={r.result} disabled={!editable} onChange={(e) => set(i, "result", e.target.value)}>
            <option value="repaired">Repaired</option>
            <option value="replaced">Replaced</option>
            <option value="unchanged">Not changed</option>
          </Select>
          <Input aria-label="Board serial" placeholder="Board serial" value={r.serialNo} disabled={!editable} onChange={(e) => set(i, "serialNo", e.target.value)} />
          <Input aria-label="New board serial" placeholder="New board serial (if replaced)" disabled={!editable || r.result !== "replaced"} value={r.replacementSerialNo} onChange={(e) => set(i, "replacementSerialNo", e.target.value)} />
          <Input aria-label="Work done on this board" className="sm:col-span-2" placeholder="e.g. Replaced 3 chips" value={r.workDone} disabled={!editable} onChange={(e) => set(i, "workDone", e.target.value)} />
          {editable && rows.length > 1 && (
            <Button variant="ghost" className="h-8 justify-start sm:col-span-2" onClick={() => setRows((x) => x.filter((_, n) => n !== i))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {editable && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" onClick={() => setRows((x) => [...x, blank()])}>
            + Add board
          </Button>
          <Button busy={busy} onClick={save}>
            Save boards
          </Button>
          {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        </div>
      )}
    </Card>
  );
}

/** Take parts from the job's site stock (or put them back). */
function Parts({ job: j, reload }: { job: JobDetail; reload: () => void }) {
  const stock = useApi<StockPage>(j.can.parts ? `/stock?siteId=${j.site.id}&limit=100` : null);
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = (stock.data?.items ?? []).filter((r) => r.qty > 0);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      reload();
      stock.reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <b className="text-base">Parts used</b>
      <div className="mt-3">
        <Table
          rows={j.parts}
          rowKey={(p) => p.id}
          empty="No parts used yet"
          columns={[
            { header: "Part", cell: (p) => p.part.name },
            { header: "Qty", emphasis: true, cell: (p) => `${p.qty} ${p.part.unit}` },
            ...(j.can.parts
              ? [
                  {
                    header: "",
                    className: "text-right",
                    cell: (p: JobDetail["parts"][number]) => (
                      <Button variant="ghost" className="h-8" disabled={!!busy} onClick={() => run(p.id, () => api(`/jobs/${j.id}/parts/${p.id}`, { method: "DELETE" }))}>
                        Return to stock
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
      {j.can.parts && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("add", () => api(`/jobs/${j.id}/parts`, { method: "POST", body: { partId, qty: Number(qty) } }))) {
              setPartId("");
              setQty("1");
            }
          }}
        >
          <div className="min-w-[200px] flex-1">
            <label htmlFor="part-pick" className="mb-1.5 block text-xs font-medium text-muted">
              Use a part from {j.site.name} stock
            </label>
            <Select id="part-pick" value={partId} onChange={(e) => setPartId(e.target.value)} required>
              <option value="">{stock.data ? (available.length ? "Pick a part…" : "No parts in stock at this site") : "Loading…"}</option>
              {available.map((r) => (
                <option key={r.part.id} value={r.part.id}>
                  {r.part.name} · {r.qty} left
                </option>
              ))}
            </Select>
          </div>
          <div className="w-20">
            <label htmlFor="part-qty" className="mb-1.5 block text-xs font-medium text-muted">
              Qty
            </label>
            <Input id="part-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          <Button type="submit" busy={busy === "add"} disabled={!partId}>
            Use part
          </Button>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
