"use client";

import { WORK_TYPES, WORK_TYPE_LABEL, type CreditWeights, type WorkType } from "@bmerc/shared";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Select } from "./ui";

const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

/** "Board repair · 5 credits" */
export const workTypeText = (t: WorkType, weights?: CreditWeights | null) => (weights ? `${WORK_TYPE_LABEL[t]} · ${credits(weights[t])}` : WORK_TYPE_LABEL[t]);

/** Options for a work type picker, each with the credits it uses under the company's plan. */
export function WorkTypeOptions({ weights }: { weights?: CreditWeights | null }) {
  return (
    <>
      {WORK_TYPES.map((t) => (
        <option key={t} value={t}>
          {workTypeText(t, weights)}
        </option>
      ))}
    </>
  );
}

/** On the job page: shows the work type, and lets people who work on the job change it until QC. */
export function WorkTypeField({
  jobId,
  value,
  charged,
  editable,
  weights,
  onSaved,
}: {
  jobId: string;
  value: WorkType;
  charged: number;
  editable: boolean;
  weights?: CreditWeights | null;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editable)
    return (
      <span>
        {WORK_TYPE_LABEL[value]}
        <span className="block text-[13px] font-normal text-muted">{charged > 0 ? `${credits(charged)} used` : weights ? `${credits(weights[value])} when it passes QC` : "No credits used"}</span>
      </span>
    );
  return (
    <span className="block max-w-[260px]">
      <Select
        aria-label="Work type"
        className="h-9"
        value={value}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          try {
            await api(`/jobs/${jobId}/work-type`, { method: "PATCH", body: { workType: e.target.value } });
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <WorkTypeOptions weights={weights} />
      </Select>
      <span className="mt-0.5 block text-xs font-normal text-muted">Credits are used when the job passes QC</span>
      {error && <span className="block text-xs text-danger">{error}</span>}
    </span>
  );
}
