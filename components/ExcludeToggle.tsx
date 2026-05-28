"use client";

import { useTransition } from "react";
import { toggleLegExcluded } from "@/app/positions/actions";

export function ExcludeToggle({
  signalId,
  excluded,
}: {
  signalId: string;
  excluded: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => void toggleLegExcluded(signalId, !excluded))}
      disabled={pending}
      className="rounded px-2 py-1 text-xs hover:bg-[rgba(148,163,184,0.15)]"
      style={{ opacity: pending ? 0.4 : 1, color: "var(--muted)" }}
      title={excluded ? "החזר לחישוב" : "הסר מהחישוב"}
    >
      {excluded ? "↺ החזר" : "✕ הסר"}
    </button>
  );
}
