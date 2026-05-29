"use client";

import { useState, useTransition } from "react";
import { savePortfolioSize } from "@/app/positions/actions";
import { useCanEdit } from "@/components/EditMode";

export function EditablePortfolioSize({ value }: { value: number }) {
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return <span className="px-2 py-1 text-sm font-semibold tabular-nums">${value.toLocaleString("en-US")}</span>;
  }

  function save() {
    setEditing(false);
    const num = Number(draft.trim());
    if (!Number.isFinite(num) || num <= 0 || num === value) return;
    startTransition(() => {
      void savePortfolioSize(num);
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
        className="w-32 rounded border px-2 py-1 text-sm tabular-nums outline-none"
        style={{ backgroundColor: "#15203a", color: "#e6ecf5", borderColor: "var(--accent)" }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value.toString());
        setEditing(true);
      }}
      className="rounded px-2 py-1 text-sm font-semibold tabular-nums hover:bg-[rgba(56,189,248,0.12)]"
      style={{ opacity: pending ? 0.5 : 1 }}
      title="לחץ לעדכון גודל התיק"
    >
      ${value.toLocaleString("en-US")}
    </button>
  );
}
