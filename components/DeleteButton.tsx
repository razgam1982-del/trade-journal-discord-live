"use client";

import { useState, useTransition } from "react";
import { useCanEdit } from "@/components/EditMode";

// Owner-only delete with an inline re-confirm: click ✕ → "בטוח? כן, מחק / ביטול".
// onConfirm runs a soft-delete server action; the item is recoverable from the
// recycle bin. Hidden entirely for non-owners.
export function DeleteButton({
  onConfirm,
  title = "מחק",
  label,
}: {
  onConfirm: () => Promise<void> | void;
  title?: string;
  label?: string;
}) {
  const canEdit = useCanEdit();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="text-xs text-[var(--muted)]">בטוח?</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            startTransition(async () => {
              await onConfirm();
              setConfirming(false);
            });
          }}
          disabled={pending}
          className="rounded px-2 py-1 text-xs font-semibold"
          style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444", opacity: pending ? 0.5 : 1 }}
        >
          כן, מחק
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
          }}
          className="rounded px-2 py-1 text-xs"
          style={{ color: "var(--muted)" }}
        >
          ביטול
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      title={title}
      className="rounded px-2 py-1 text-xs hover:bg-[rgba(239,68,68,0.12)]"
      style={{ color: "#ef4444" }}
    >
      ✕{label ? ` ${label}` : ""}
    </button>
  );
}
