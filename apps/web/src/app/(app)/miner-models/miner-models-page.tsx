"use client";

import type { ReactNode } from "react";
import { useApi } from "@/lib/use-api";
import type { MinerModel } from "@/lib/types";
import { ButtonLink, Chip, ErrorState, Loading, PageHeader, Table } from "@/components/ui";

/** Hashboards and chips of each miner model, kept by BMERC. Read-only for companies. */
export function MinerModelsPage() {
  const list = useApi<MinerModel[]>("/miner-models");
  return (
    <>
      <PageHeader
        title="Miner models"
        subtitle="Hashboards and chips of each model. Used when you receive a device, pick parts and record boards"
        actions={
          <ButtonLink href="/parts" variant="secondary">
            Back to parts
          </ButtonLink>
        }
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <>
          <ModelList models={list.data} />
          <p className="mt-3 text-xs text-muted">Not checked means BMERC has not yet confirmed the numbers on a real unit. Ask BMERC to add a model or fix a number.</p>
        </>
      )}
    </>
  );
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function ModelList({ models, action }: { models: MinerModel[]; action?: (m: MinerModel) => ReactNode }) {
  return (
    <Table
      rows={models}
      rowKey={(m) => m.id}
      empty="No miner models yet"
      columns={[
        { header: "Model", cell: (m) => m.name },
        { header: "Brand", cell: (m) => m.brand },
        { header: "Hashboards", cell: (m) => m.hashboards },
        { header: "Chip", cell: (m) => m.chipModel ?? "—" },
        { header: "Chips per board", cell: (m) => m.chipsPerBoard ?? "—" },
        { header: "Hashrate", cell: (m) => (m.hashrateTh ? `${Number(m.hashrateTh)} TH/s` : "—") },
        { header: "Notes", cell: (m) => m.notes ?? "—" },
        {
          header: "Source",
          cell: (m) =>
            m.sourceUrl ? (
              <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-info hover:underline">
                {host(m.sourceUrl)}
              </a>
            ) : (
              "—"
            ),
        },
        { header: "Status", cell: (m) => (!m.isActive ? <Chip tone="neutral">Hidden</Chip> : m.verified ? <Chip tone="success">Checked</Chip> : <Chip tone="warn">Not checked</Chip>) },
        ...(action ? [{ header: "", cell: action }] : []),
      ]}
    />
  );
}
