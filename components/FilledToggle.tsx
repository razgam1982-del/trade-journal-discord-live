"use client";

import { useTransition } from "react";
import { saveLegFilled } from "@/app/positions/actions";

// Shown on limit/trigger entry legs: toggle between pending (not taken, 0
// performance) and filled (counted).
export function FilledToggle({ signalId, pending }: { signalId: string; pending: boolean }) {
  const [busy, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => void saveLegFilled(signalId, pending ? true : false))}
      disabled={busy}
      className="rounded px-2 py-1 text-xs"
      style={{
        opacity: busy ? 0.4 : 1,
        background: pending ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
        color: pending ? "var(--green)" : "var(--muted)",
      }}
      title={pending ? "סמן שהעסקה נכנסה (תיספר)" : "סמן כממתינה (לא נספרת)"}
    >
      {pending ? "✓ סמן שנכנסה" : "↩ החזר להמתנה"}
    </button>
  );
}
