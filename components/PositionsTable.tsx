"use client";

import { Fragment, useState } from "react";
import type { Position } from "@/types";
import { EditablePrice } from "./EditablePrice";
import { ExcludeToggle } from "./ExcludeToggle";
import { EditSignalButton } from "./EditSignalButton";
import { EditableCurrentPrice } from "./EditableCurrentPrice";
import { FilledToggle } from "./FilledToggle";
import { DeleteButton } from "./DeleteButton";
import { deleteSignal, deletePosition } from "@/app/positions/actions";

const GREEN = "#22c55e";
const RED = "#ef4444";
const ACCENT = "#38bdf8";

const DIR: Record<string, string> = { long: "לונג", short: "שורט", unknown: "—" };
const LEG: Record<string, string> = { entry: "כניסה", reduce: "הפחתה", close: "סגירה", cancel: "ביטול" };
const ETYPE: Record<string, string> = { immediate: "מיידית", trigger: "טריגר", limit: "לימיט" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function money(n: number | null): string {
  if (n == null) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function pct(n: number | null): string {
  return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function plColor(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? GREEN : RED;
}

function Badge({ result, partial }: { result: string; partial: boolean }) {
  const map: Record<string, { t: string; bg: string; c: string }> = {
    win: { t: "רווח", bg: "rgba(34,197,94,0.15)", c: GREEN },
    loss: { t: "הפסד", bg: "rgba(239,68,68,0.15)", c: RED },
    open: { t: "פתוח", bg: "rgba(56,189,248,0.15)", c: ACCENT },
  };
  const s = map[result];
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: s.bg, color: s.c }}>
      {s.t}
      {partial ? " · חלקי" : ""}
    </span>
  );
}

// Aggregate metrics for a position — realized / open / total (each $, %, R) plus
// the forward-looking potential. Always visible inside the position card.
function Summary({ p }: { p: Position }) {
  const realized$ = p.pnl_dollars;
  const open$ = p.unrealized_pnl_dollars;
  const total$ = realized$ != null || open$ != null ? (realized$ ?? 0) + (open$ ?? 0) : null;
  const totalPct =
    p.pnl_percent != null || p.unrealized_pnl_percent != null ? (p.pnl_percent ?? 0) + (p.unrealized_pnl_percent ?? 0) : null;
  const totalR = p.r_achieved != null || p.unrealized_r != null ? (p.r_achieved ?? 0) + (p.unrealized_r ?? 0) : null;
  return (
    <div className="grid gap-x-8 gap-y-3 text-sm tabular-nums sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <div className="font-semibold">
          <span className="text-[var(--muted)]">רווח/הפסד ממומש</span>
          {p.closed_fraction > 0 && (
            <span className="ms-2 rounded px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>ממומש {Math.round(p.closed_fraction * 100)}%</span>
          )}
        </div>
        <div className="ms-1 mt-0.5 flex flex-col gap-0.5">
          <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-semibold" style={{ color: plColor(p.pnl_dollars) }}>{p.pnl_dollars != null ? money(p.pnl_dollars) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: plColor(p.pnl_percent) }}>{p.pnl_percent != null ? pct(p.pnl_percent) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: plColor(p.r_achieved) }}>{p.r_achieved != null ? `${p.r_achieved.toFixed(2)}R` : "—"}</span></div>
        </div>
      </div>

      {p.status === "open" && (
        <div>
          <div className="font-semibold text-[var(--muted)]">רווח/הפסד פתוח</div>
          <div className="ms-1 mt-0.5 flex flex-col gap-0.5">
            <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-semibold" style={{ color: plColor(p.unrealized_pnl_dollars) }}>{p.unrealized_pnl_dollars != null ? money(p.unrealized_pnl_dollars) : "הזן מחיר נוכחי"}</span></div>
            <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: plColor(p.unrealized_pnl_percent) }}>{p.unrealized_pnl_percent != null ? pct(p.unrealized_pnl_percent) : "—"}</span></div>
            <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: plColor(p.unrealized_r) }}>{p.unrealized_r != null ? `${p.unrealized_r.toFixed(2)}R` : "—"}</span></div>
          </div>
        </div>
      )}

      <div>
        <div className="font-semibold">סך הכל (ממומש + פתוח)</div>
        <div className="ms-1 mt-0.5 flex flex-col gap-0.5">
          <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-bold" style={{ color: plColor(total$) }}>{total$ != null ? money(total$) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: plColor(totalPct) }}>{totalPct != null ? pct(totalPct) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: plColor(totalR) }}>{totalR != null ? `${totalR.toFixed(2)}R` : "—"}</span></div>
        </div>
      </div>

      {p.potential_rr != null && (
        <div>
          <div className="font-semibold text-[var(--muted)]">פוטנציאל עסקה <span className="text-xs font-normal">(עד הטייק, על החלק הפתוח)</span></div>
          <div className="ms-1 mt-0.5 flex flex-col gap-0.5">
            <div>
              <span className="text-[var(--muted)]">רווח: </span>
              <span className="font-semibold" style={{ color: GREEN }}>{p.potential_profit_dollars != null ? money(p.potential_profit_dollars) : "—"}</span>
              <span className="text-[var(--muted)]"> · </span>
              <span style={{ color: GREEN }}>{p.potential_profit_percent != null ? pct(p.potential_profit_percent) : "—"}</span>
            </div>
            <div>
              <span className="text-[var(--muted)]">הפסד: </span>
              <span className="font-semibold" style={{ color: RED }}>{p.potential_loss_dollars != null ? money(p.potential_loss_dollars) : "—"}</span>
              <span className="text-[var(--muted)]"> · </span>
              <span style={{ color: RED }}>{p.potential_loss_percent != null ? pct(p.potential_loss_percent) : "—"}</span>
            </div>
            <div>
              <span className="text-[var(--muted)]">סיכוי/סיכון: </span>
              <span className="font-bold">{`1:${p.potential_rr.toFixed(2)}`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Per-leg breakdown (entries, reduces, closes) — shown when the card is expanded.
function LegsTable({ p }: { p: Position }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          {["תאריך", "סוג", "פרט", "מחיר כניסה/יציאה", "סטופ", "טייק", "סיכון", "ממומש $", "פתוח $", ""].map((h, i) => (
            <th key={i} className="border-b border-[var(--border)] px-2 py-1.5 text-right text-xs text-[var(--muted)]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {p.legs.map((leg) => {
          const rem = leg.remaining ?? 1;
          const closedEntry = leg.kind === "entry" && rem <= 0.0001;
          const reducedEntry = leg.kind === "entry" && rem > 0.0001 && rem < 0.9999;
          const struck = leg.excluded
            ? { textDecoration: "line-through" as const, opacity: 0.45 }
            : closedEntry
              ? { textDecoration: "line-through" as const, opacity: 0.55 }
              : leg.pending
                ? { opacity: 0.6 }
                : undefined;
          const isLimitEntry = leg.kind === "entry" && (leg.entry_type === "limit" || leg.entry_type === "trigger");
          const detail =
            leg.kind === "entry"
              ? leg.entry_type
                ? ETYPE[leg.entry_type] ?? leg.entry_type
                : "כניסה"
              : (leg.kind === "reduce" || leg.kind === "close") && leg.close_percent != null
                ? `${leg.quantity_text ?? LEG[leg.kind]} · ${leg.close_percent}% מהפוזיציה`
                : leg.quantity_text ?? LEG[leg.kind];
          return (
            <Fragment key={leg.signal_id}>
            <tr>
              <td className="border-b border-[var(--border)] px-2 py-1.5 text-[var(--muted)] tabular-nums whitespace-nowrap" style={struck}>{fmtTime(leg.date)}</td>
              <td className="border-b border-[var(--border)] px-2 py-1.5" style={struck}>{LEG[leg.kind]}</td>
              <td className="border-b border-[var(--border)] px-2 py-1.5" style={struck}>
                {detail}
                {leg.pending && (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>ממתין</span>
                )}
                {leg.needs_percent && (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>צריך אחוז</span>
                )}
                {closedEntry && (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: RED }}>נסגרה</span>
                )}
                {reducedEntry && (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>הופחת · נותר {Math.round(rem * 100)}%</span>
                )}
                {leg.kind === "entry" && !closedEntry && !reducedEntry && !leg.pending && (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(34,197,94,0.12)", color: GREEN }}>פתוחה</span>
                )}
                {leg.manually_edited ? (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(56,189,248,0.15)", color: ACCENT }}>ידני</span>
                ) : (
                  <span className="ms-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(148,163,184,0.12)", color: "var(--muted)" }}>בוט</span>
                )}
              </td>
              <td className="border-b border-[var(--border)] px-1 py-1" style={struck}>
                {leg.kind === "cancel" ? <span className="px-2 text-[var(--muted)]">—</span> : <EditablePrice signalId={leg.signal_id} kind={leg.kind} value={leg.price} />}
              </td>
              <td className="border-b border-[var(--border)] px-2 py-1.5 tabular-nums" style={{ ...struck, color: leg.stop != null ? "var(--gold)" : undefined }}>{leg.stop != null ? leg.stop : "—"}</td>
              <td className="border-b border-[var(--border)] px-2 py-1.5 tabular-nums" style={{ ...struck, color: leg.tp != null ? GREEN : undefined }}>{leg.tp != null ? leg.tp : "—"}</td>
              <td className="border-b border-[var(--border)] px-2 py-1.5 tabular-nums" style={struck}>{leg.risk_percent != null ? `${leg.risk_percent}%` : "—"}</td>
              <td className="border-b border-[var(--border)] px-2 py-1.5 tabular-nums font-bold" style={{ color: leg.kind === "entry" ? plColor(leg.realized_dollars) : undefined }}>
                {leg.kind === "entry" && leg.realized_dollars != null ? money(leg.realized_dollars) : "—"}
              </td>
              <td className="border-b border-[var(--border)] px-2 py-1.5 tabular-nums font-semibold" style={{ color: leg.kind === "entry" ? plColor(leg.open_dollars) : undefined }}>
                {leg.kind === "entry" && leg.open_dollars != null ? money(leg.open_dollars) : "—"}
              </td>
              <td className="border-b border-[var(--border)] px-1 py-1 text-left whitespace-nowrap">
                {isLimitEntry && <FilledToggle signalId={leg.signal_id} pending={leg.pending} />}
                {leg.discord_url && (
                  <a href={leg.discord_url} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 text-xs" style={{ color: ACCENT }} title="פתח בדיסקורד">↗</a>
                )}
                <EditSignalButton signalId={leg.signal_id} />
                <ExcludeToggle signalId={leg.signal_id} excluded={leg.excluded} />
                <DeleteButton onConfirm={() => deleteSignal(leg.signal_id)} title="מחק שורה זו" />
              </td>
            </tr>
            {leg.kind === "entry" && leg.closes.map((c, ci) => (
              <tr key={`${leg.signal_id}-c${ci}`} style={{ background: "rgba(56,189,248,0.04)" }}>
                <td className="border-b border-[var(--border)] py-1 ps-6 pe-2 text-[var(--muted)] tabular-nums whitespace-nowrap text-xs">↳ {fmtTime(c.date)}</td>
                <td className="border-b border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">מימוש</td>
                <td className="border-b border-[var(--border)] px-2 py-1 text-xs">{(c.label ?? "מימוש")} · {Math.round(c.fraction * 100)}% מהרגל</td>
                <td className="border-b border-[var(--border)] px-2 py-1 text-xs tabular-nums">{c.price != null ? c.price : "—"}</td>
                <td className="border-b border-[var(--border)] px-2 py-1">—</td>
                <td className="border-b border-[var(--border)] px-2 py-1">—</td>
                <td className="border-b border-[var(--border)] px-2 py-1">—</td>
                <td className="border-b border-[var(--border)] px-2 py-1 text-xs tabular-nums font-semibold" style={{ color: plColor(c.realized_dollars) }}>{c.realized_dollars != null ? money(c.realized_dollars) : "—"}</td>
                <td className="border-b border-[var(--border)] px-2 py-1">—</td>
                <td className="border-b border-[var(--border)] px-2 py-1 text-left">
                  <span className="rounded px-1.5 py-0.5 text-[10px]" style={c.manually_edited ? { background: "rgba(56,189,248,0.15)", color: ACCENT } : { background: "rgba(148,163,184,0.12)", color: "var(--muted)" }}>{c.manually_edited ? "ידני" : "בוט"}</span>
                </td>
              </tr>
            ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">
        עדיין אין עסקאות. סיגנלים שייכנסו יקובצו לכאן אוטומטית.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {positions.map((p, i) => {
        const result = p.status === "open" ? "open" : (p.pnl_dollars ?? 0) >= 0 ? "win" : "loss";
        const border = result === "win" ? GREEN : result === "loss" ? RED : ACCENT;
        const key = p.key + p.opened_at;
        const isOpen = expanded.has(key);
        const partial = p.status === "open" && p.legs.some((l) => l.kind === "reduce" || l.kind === "close");
        return (
          // One bordered box per trade so it's clear all the data belongs together.
          <div key={key} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]" style={{ boxShadow: `inset 4px 0 0 0 ${border}` }}>
            {/* Identity + actions. Clicking the header toggles the per-leg breakdown. */}
            <div className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-[rgba(56,189,248,0.04)]" onClick={() => toggle(key)}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs tabular-nums text-[var(--muted)]">#{i + 1}</span>
                <span className="text-xs tabular-nums text-[var(--muted)]">{fmtDate(p.opened_at)}</span>
                <span className="text-base font-bold">{p.asset}</span>
                {p.needs_review && <span className="text-[10px]" style={{ color: "var(--gold)" }} title="דורש בדיקה">⚠</span>}
                <span className="text-sm font-semibold" style={{ color: p.direction === "long" ? GREEN : p.direction === "short" ? RED : "var(--muted)" }}>{DIR[p.direction]}</span>
                <Badge result={result} partial={partial} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DeleteButton onConfirm={() => deletePosition(p.legs.map((l) => l.signal_id))} title="מחק את כל העסקה" label="מחק עסקה" />
                <span className="text-xs text-[var(--muted)]">{isOpen ? "▲ הסתר רגליים" : "▼ הצג רגליים"}</span>
              </div>
            </div>

            {/* Prices */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--border)] px-4 py-2 text-sm tabular-nums">
              <span><span className="text-[var(--muted)]">ממוצע כניסה: </span>{p.avg_entry_price != null ? p.avg_entry_price.toFixed(2) : "—"}</span>
              <span><span className="text-[var(--muted)]">ממוצע יציאה: </span>{p.avg_exit_price != null ? p.avg_exit_price.toFixed(2) : "—"}</span>
              {p.status === "open" && (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[var(--muted)]">מחיר נוכחי:</span>
                  <EditableCurrentPrice asset={p.asset} value={p.current_price} />
                </span>
              )}
              <span><span className="text-[var(--muted)]">סיכון: </span>{p.total_risk_percent.toFixed(2)}%</span>
            </div>

            {/* Aggregate metrics — always visible */}
            <div className="border-t border-[var(--border)] px-4 py-3">
              <Summary p={p} />
            </div>

            {/* Per-leg breakdown — on expand */}
            {isOpen && (
              <div className="overflow-x-auto border-t border-[var(--border)] bg-[var(--panel-2)] p-3">
                <LegsTable p={p} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
