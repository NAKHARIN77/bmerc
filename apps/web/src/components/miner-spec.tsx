"use client";

import type { MinerModel } from "@/lib/types";
import { Chip } from "./ui";

/** One line: "3 hashboards · BM1362 × 126 per board · 100 TH/s", plus a flag while the numbers are unchecked. */
export function specLine(m: Pick<MinerModel, "hashboards" | "chipModel" | "chipsPerBoard" | "hashrateTh">) {
  const chips = m.chipModel ? `${m.chipModel}${m.chipsPerBoard ? ` × ${m.chipsPerBoard} per board` : ""}` : m.chipsPerBoard ? `${m.chipsPerBoard} chips per board` : "chip not listed";
  return [`${m.hashboards} hashboard${m.hashboards === 1 ? "" : "s"}`, chips, m.hashrateTh ? `${Number(m.hashrateTh)} TH/s` : null].filter(Boolean).join(" · ");
}

export function MinerSpec({ model, className = "" }: { model: MinerModel; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[13px] text-muted ${className}`}>
      <span>{specLine(model)}</span>
      {!model.verified && <Chip tone="warn">Not checked</Chip>}
    </div>
  );
}

/** Board slots of a model for the "Boards worked on" picker. */
export const boardSlots = (m: Pick<MinerModel, "hashboards"> | null) => [
  ...Array.from({ length: m?.hashboards ?? 3 }, (_, i) => `Hashboard ${i + 1}`),
  "Control board",
  "Power supply",
  "Fans",
];
