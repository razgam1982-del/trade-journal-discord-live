"use client";

import { useState, useTransition } from "react";
import { useCanEdit } from "@/components/EditMode";
import { closePositionManually } from "@/app/positions/actions";

export function ClosePositionButton({
  anchorSignalId,
  currentPrice,
}: {
  anchorSignalId: string;
  currentPrice: number | null;
}) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(currentPrice != null ? String(currentPrice) : "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!canEdit) return null;

  function submit() {
    const n = parseFloat(val.replace(",", "."));
    if (!Number.isFinite(n)) {
      setErr("מחיר לא תקין");
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        await closePositionManually(anchorSignalId, n);
        setOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors hover:brightness-125"
        style={{ borderColor: "rgba(34,197,94,0.45)", background: "rgba(34,197,94,0.12)", color: "#22c55e" }}
        title="הוסף רגל סגירה ב-100% במחיר שתקליד (העסקה תעבור לסטטוס סגורה)"
      >
        סגור עסקה ידנית
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "rgba(34,197,94,0.45)", background: "rgba(34,197,94,0.08)" }}>
      <span className="text-[var(--muted)]">מחיר יציאה:</span>
      <input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        autoFocus
        className="w-24 rounded border bg-transparent px-1.5 py-0.5 tabular-nums"
        style={{ borderColor: "rgba(34,197,94,0.4)" }}
        placeholder="מחיר"
      />
      <button
        onClick={submit}
        disabled={pending}
        className="rounded bg-[#22c55e]/20 px-2 py-0.5 font-semibold text-[#22c55e] hover:bg-[#22c55e]/30 disabled:opacity-50"
      >
        {pending ? "..." : "✓ סגור"}
      </button>
      <button onClick={() => setOpen(false)} className="rounded px-2 py-0.5 text-[var(--muted)]">ביטול</button>
      {err && <span className="text-[#ef4444]">{err}</span>}
    </span>
  );
}
