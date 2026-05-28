"use client";

import { useState, useTransition } from "react";
import { saveMarketPrice } from "@/app/positions/actions";

export function EditableCurrentPrice({
  asset,
  value,
}: {
  asset: string;
  value: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    setEditing(false);
    const trimmed = draft.trim();
    const num = trimmed === "" ? null : Number(trimmed);
    if (num !== null && Number.isNaN(num)) return;
    if (num === value) return;
    startTransition(() => {
      void saveMarketPrice(asset, num);
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded border px-2 py-1 text-sm tabular-nums outline-none"
        style={{ backgroundColor: "#15203a", color: "#e6ecf5", borderColor: "var(--accent)" }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value?.toString() ?? "");
        setEditing(true);
      }}
      className="rounded px-2 py-1 text-sm font-semibold tabular-nums hover:bg-[rgba(56,189,248,0.12)]"
      style={{ opacity: pending ? 0.5 : 1 }}
      title="לחץ לעדכון המחיר הנוכחי"
    >
      {value != null ? value : <span className="text-[var(--muted)] font-normal">+ הזן מחיר</span>}
    </button>
  );
}
