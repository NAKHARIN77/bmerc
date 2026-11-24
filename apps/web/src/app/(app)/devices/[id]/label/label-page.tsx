"use client";

import QRCode from "qrcode";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { DeviceHistory, JobDetail, JobRow, Page } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, ErrorState, Field, Loading, PageHeader, Select, Table } from "@/components/ui";

// Only the label prints, once, on a single 50 × 30 mm page. A copy of the label sits directly in <body>
// and everything else is removed from the print layout, so nothing spills onto extra pages.
const PRINT_CSS = `
#printlabel { display: none; }
@media print {
  @page { size: 50mm 30mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#printlabel) { display: none !important; }
  #printlabel { display: block; width: 50mm; height: 30mm; overflow: hidden; break-inside: avoid; }
  #printlabel > div { border: 0 !important; border-radius: 0 !important; }
}`;

/** Print QR label (prototype "qrprint"). The QR links to /scan?code=…, so any phone camera opens the device history after log-in. */
export function LabelPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const jobParam = useSearchParams().get("job");
  const d = useApi<DeviceHistory>(`/devices/${id}/history`);
  const qcJobs = useApi<Page<JobRow>>("/jobs?status=qc_passed&limit=100");
  const jobId = jobParam ?? d.data?.jobs.find((j) => j.qcPassedAt)?.id ?? null;
  const job = useApi<JobDetail>(jobId ? `/jobs/${jobId}` : null);
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = d.data?.qrCode ?? null;

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(`${window.location.origin}/scan?code=${code}`, { margin: 0, width: 240, errorCorrectionLevel: "M" }).then(setImg, () => setImg(null));
  }, [code]);

  const back = (
    <ButtonLink href="/board" variant="secondary">
      Back to board
    </ButtonLink>
  );
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />;
  if (!d.data) return <Loading />;
  const v = d.data;
  if (!code) {
    return (
      <>
        <PageHeader title="Print QR label" subtitle="No job has passed QC yet" actions={back} />
        <Card>No label to print yet. A label is created when a job passes QC.</Card>
      </>
    );
  }

  const j = job.data;
  const test = j?.tests[0];
  // Picker: every job that passed QC, plus this one if it has since been returned to the customer.
  const options: Array<Pick<JobRow, "id" | "number" | "device">> = [...(qcJobs.data?.items ?? [])];
  if (j && !options.some((o) => o.id === j.id)) options.unshift(j);

  async function markPrinted() {
    if (!j) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/jobs/${j.id}/label/printed`, { method: "POST", body: { copies: 1 } });
      job.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const label: ReactNode = (
    <div className="mx-auto box-border flex h-[30mm] w-[50mm] flex-col rounded-md border border-navy bg-white p-[1.5mm] text-left text-navy">
      <div className="text-[6pt] font-bold leading-none">BMERC REPAIR CENTER</div>
      <div className="mt-[1mm] flex min-h-0 flex-1 gap-[1.5mm]">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise */}
        {img ? <img src={img} alt={`QR code ${code}`} className="h-[22mm] w-[22mm] flex-none" /> : <div className="h-[22mm] w-[22mm]" />}
        <div className="min-w-0 text-[5.5pt] leading-[1.4]">
          <b className="block text-[6.5pt]">{code}</b>
          <div className="truncate">{v.model}</div>
          {j && <div>Ticket: {j.number}</div>}
          <div>Test: {test ? `${test.passed ? "Pass" : "Fail"} on ${fmtDate(test.testedOn)}` : "Not tested"}</div>
          <div className="line-clamp-2">Work: {test?.workDone || j?.workNote || "-"}</div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      {img && createPortal(<div id="printlabel">{label}</div>, document.body)}
      <PageHeader
        title="Print QR label"
        subtitle="Only jobs that passed QC can print a label"
        actions={
          <>
            {back}
            <Button variant="secondary" busy={busy} disabled={!j} onClick={markPrinted}>
              Mark as printed
            </Button>
            <Button onClick={() => window.print()} disabled={!img}>
              Print label
            </Button>
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="text-center">
          {label}
          <p className="mt-3 text-xs text-muted">Label preview at 50 × 30 mm</p>
        </Card>
        <Card>
          <Field label="Job passed QC">
            {(fid) => (
              <Select
                id={fid}
                value={j?.id ?? ""}
                onChange={(e) => {
                  const o = options.find((x) => x.id === e.target.value);
                  if (o) router.push(`/devices/${o.device.id}/label?job=${o.id}`);
                }}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {o.device.model}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <b className="mb-3 mt-2 block">Print history</b>
          <Table
            rows={j?.qrPrintLogs ?? []}
            rowKey={(l) => l.id}
            empty="No labels printed yet"
            columns={[
              { header: "Ticket", cell: () => j?.number },
              { header: "Printed", cell: (l) => `${fmtDateTime(l.printedAt)}${l.copies > 1 ? ` (${l.copies} copies)` : ""}` },
              { header: "Printed by", cell: (l) => l.by ?? "—" },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
