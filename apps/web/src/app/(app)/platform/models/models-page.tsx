"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import type { MinerModel } from "@/lib/types";
import { Alert, Button, ErrorState, Loading, PageHeader } from "@/components/ui";
import { OwnerOnly } from "../owner-only";
import { ModelForm, ModelList } from "../../miner-models/miner-models-page";

/**
 * Platform owner: the miner model list every company uses (hashboards, chip, chips per board).
 * Tick Checked once the numbers are confirmed on a real unit or the maker's sheet.
 */
export function PlatformModelsPage() {
  return (
    <OwnerOnly>
      <Models />
    </OwnerOnly>
  );
}

type Row = MinerModel & { devices: number };

function Models() {
  const list = useApi<Row[]>("/platform/miner-models");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const rows = list.data;
  const unchecked = rows.filter((m) => !m.verified && m.isActive).length;
  return (
    <>
      <PageHeader
        title="Miner models"
        subtitle="Hashboards and chips per model, used by every company at intake, when picking parts and recording boards"
        actions={<Button onClick={() => setEditing("new")}>+ Add model</Button>}
      />
      {unchecked > 0 && (
        <Alert tone="warn">
          {unchecked} {unchecked === 1 ? "model has" : "models have"} numbers that are not checked yet. Open each one, compare with a real unit or the maker&apos;s sheet, then tick Checked.
        </Alert>
      )}
      {editing && (
        <ModelForm
          key={editing === "new" ? "new" : editing.id}
          base="/platform/miner-models"
          platform
          model={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      <ModelList
        models={rows}
        action={(m) => (
          <Button
            variant="secondary"
            className="h-9"
            onClick={() => {
              setEditing(rows.find((r) => r.id === m.id) ?? null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Edit
          </Button>
        )}
      />
    </>
  );
}
