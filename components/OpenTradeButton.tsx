"use client";

import { useState, useTransition } from "react";
import { useCanEdit } from "@/components/EditMode";
import { openTradeManually } from "@/app/positions/actions";

export function OpenTradeButton({ channelId }: { channelId: string }) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  function submit() {
    if (!text.trim()) {
      setErr("הדבק טקסט עסקה");
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        await openTradeManually(channelId, text);
        setText("");
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
        className="rounded-xl border px-4 py-2 text-sm font-bold transition hover:brightness-125"
        style={{ borderColor: "rgba(56,189,248,0.6)", background: "rgba(56,189,248,0.12)", color: "#7dd3fc" }}
        title="פתח עסקה חדשה ידנית — או הקלד שדות, או הדבק טקסט בפורמט דיסקורד"
      >
        + פתח עסקה ידנית
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl border-2 bg-[var(--panel)] p-6" style={{ borderColor: "rgba(56,189,248,0.5)" }}>
        <h3 className="mb-2 text-lg font-extrabold" style={{ color: "#7dd3fc" }}>פתיחת עסקה ידנית</h3>
        <p className="mb-3 text-xs text-[var(--muted)]">
          הדבק טקסט בפורמט שאנו מקבלים מהדיסקורד (נכס · כיוון · סיכון · STOP · TP · כניסה מיידית/טריגר/לימיט).
          הפרסר יזהה את השדות אוטומטית. דוגמה:
        </p>
        <pre className="mb-3 rounded-lg border p-2 text-[11px] text-[var(--muted)]" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.25)" }}>
{`NVDA לונג
כניסה מיידית
סיכון 0.15%
STOP 208
TP 249`}
        </pre>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="הדבק את הטקסט כאן..."
          rows={10}
          autoFocus
          className="w-full rounded-lg border bg-transparent p-3 font-mono text-sm tabular-nums"
          style={{ borderColor: "var(--border)" }}
        />
        {err && <div className="mt-2 text-sm" style={{ color: "#ef4444" }}>{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
            ביטול
          </button>
          <button onClick={submit} disabled={pending} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ borderColor: "rgba(56,189,248,0.6)", background: "rgba(56,189,248,0.18)", color: "#7dd3fc" }}>
            {pending ? "מנתח..." : "✓ פתח עסקה"}
          </button>
        </div>
      </div>
    </div>
  );
}
