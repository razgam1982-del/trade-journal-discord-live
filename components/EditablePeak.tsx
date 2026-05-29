"use client";

import { useState, useTransition } from "react";
import { savePositionPeak } from "@/app/positions/actions";
import { useCanEdit } from "@/components/EditMode";

// Manual peak price for a position (stored on its anchor entry leg). Drives the
// "money left on the floor" metric. Read-only for non-owners.
export function EditablePeak({ signalId, value }: { signalId: string; value: number | null }) {
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return value != null ? (
      <span className="px-1 text-sm font-semibold tabular-nums">{value}</span>
    ) : (
      <span className="px-1 text-sm text-[var(--muted)]">—</span>
    );
  }

  function save() {
    setEditing(false);
    const trimmed = draft.trim();
    const num = trimmed === "" ? null : Number(trimmed);
    if (num !== null && Number.isNaN(num)) return;
    if (num === value) return;
    startTransition(() => {
      void savePositionPeak(signalId, num);
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
      title="מחיר השיא שאליו הגיע הנכס אחרי שיצאת"
    >
      {value != null ? value : <span className="font-normal text-[var(--muted)]">+ הזן שיא</span>}
    </button>
  );
}
