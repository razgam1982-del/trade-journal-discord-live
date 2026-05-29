"use client";

import { useTransition } from "react";
import { useCanEdit } from "@/components/EditMode";

export type RecycleItem = { id: string; title: string; sub?: string };

// Owner-only recycle bin: lists soft-deleted items with a restore button.
// Renders nothing for non-owners or when empty — the deleted data is only ever
// fetched/sent when the viewer is the owner.
export function RecycleBin({
  heading,
  items,
  onRestore,
}: {
  heading: string;
  items: RecycleItem[];
  onRestore: (id: string) => Promise<void> | void;
}) {
  const canEdit = useCanEdit();
  const [pending, startTransition] = useTransition();

  if (!canEdit || items.length === 0) return null;

  return (
    <details className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--muted)]">
        🗑 {heading} ({items.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{it.title}</div>
              {it.sub && <div className="truncate text-xs text-[var(--muted)]">{it.sub}</div>}
            </div>
            <button
              onClick={() => startTransition(async () => { await onRestore(it.id); })}
              disabled={pending}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", opacity: pending ? 0.5 : 1 }}
            >
              ↺ שחזר
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
