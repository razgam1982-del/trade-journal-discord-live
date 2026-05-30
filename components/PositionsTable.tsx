"use client";

import { Fragment, useState } from "react";
import type { Position } from "@/types";
import { EditablePrice } from "./EditablePrice";
import { ExcludeToggle } from "./ExcludeToggle";
import { EditSignalButton } from "./EditSignalButton";
import { EditableCurrentPrice } from "./EditableCurrentPrice";
import { EditablePeak } from "./EditablePeak";
import { FilledToggle } from "./FilledToggle";
import { DeleteButton } from "./DeleteButton";
import { useCanEdit } from "@/components/EditMode";
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

      {p.left_on_floor_dollars != null && (
        <div>
          <div className="font-semibold text-[var(--muted)]">כסף שהושאר על הרצפה <span className="text-xs font-normal">(עד השיא, על החלק שנסגר)</span></div>
          <div className="ms-1 mt-0.5 flex flex-col gap-0.5">
            <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-bold" style={{ color: "var(--gold)" }}>{money(p.left_on_floor_dollars)}</span></div>
            <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: "var(--gold)" }}>{p.left_on_floor_percent != null ? pct(p.left_on_floor_percent) : "—"}</span></div>
            <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: "var(--gold)" }}>{p.left_on_floor_r != null ? `${p.left_on_floor_r.toFixed(2)}R` : "—"}</span></div>
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

const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

// Group positions by year-month of opened_at and compute per-month aggregates.
// Newest month first, and within each month newest position first.
function groupByMonth(positions: Position[]) {
  const groups = new Map<string, { key: string; name: string; positions: Position[]; realized: number; open: number; closedCount: number; openCount: number; wins: number; losses: number }>();
  for (const p of positions) {
    const d = new Date(p.opened_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, name: `${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        positions: [], realized: 0, open: 0, closedCount: 0, openCount: 0, wins: 0, losses: 0,
      });
    }
    const g = groups.get(key)!;
    g.positions.push(p);
    g.realized += p.pnl_dollars ?? 0;
    g.open += p.unrealized_pnl_dollars ?? 0;
    if (p.pnl_dollars != null) {
      g.closedCount++;
      if (p.pnl_dollars > 0) g.wins++;
      else if (p.pnl_dollars < 0) g.losses++;
    } else {
      g.openCount++;
    }
  }
  // Sort positions within each month: newest first (by opened_at desc).
  for (const g of groups.values()) {
    g.positions.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  }
  // Sort months: newest first (key is YYYY-MM, desc).
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  const canEdit = useCanEdit();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);
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
      <div className="flex justify-end">
        <button
          onClick={() => setCompact((c) => !c)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[rgba(56,189,248,0.08)]"
        >
          {compact ? "▼ הצג תצוגה מלאה" : "▲ צמצם תצוגה (שורה ראשית בלבד)"}
        </button>
      </div>
      {(() => {
        const groups = groupByMonth(positions);
        let globalIdx = 0;
        return groups.map((g) => (
          <Fragment key={`m-${g.key}`}>
            <MonthHeader group={g} />
            {g.positions.map((p) => {
              const i = globalIdx++;
              return renderPosition(p, i);
            })}
          </Fragment>
        ));
      })()}
    </div>
  );

  function renderPosition(p: Position, i: number) {
    const result = p.status === "open" ? "open" : (p.pnl_dollars ?? 0) >= 0 ? "win" : "loss";
    const border = result === "win" ? GREEN : result === "loss" ? RED : ACCENT;
    const key = p.key + p.opened_at;
        const isOpen = expanded.has(key);
        const partial = p.status === "open" && p.legs.some((l) => l.kind === "reduce" || l.kind === "close");
        const total$ = p.pnl_dollars != null || p.unrealized_pnl_dollars != null ? (p.pnl_dollars ?? 0) + (p.unrealized_pnl_dollars ?? 0) : null;
        const totalPct = p.pnl_percent != null || p.unrealized_pnl_percent != null ? (p.pnl_percent ?? 0) + (p.unrealized_pnl_percent ?? 0) : null;
        const totalR = p.r_achieved != null || p.unrealized_r != null ? (p.r_achieved ?? 0) + (p.unrealized_r ?? 0) : null;
        const anchorId = p.legs.find((l) => l.kind === "entry")?.signal_id;
        return (
          // One bordered box per trade so it's clear all the data belongs together.
          <div key={key} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]" style={{ boxShadow: `inset 4px 0 0 0 ${border}` }}>
            {/* Top line: identity + prices on the right, status + delete on the left. */}
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base tabular-nums">
                <span className="text-sm text-[var(--muted)]">#{i + 1}</span>
                <span className="text-sm text-[var(--muted)]">{fmtDate(p.opened_at)}</span>
                <span className="text-xl font-bold">{p.asset}</span>
                {p.needs_review && <span className="text-[10px]" style={{ color: "var(--gold)" }} title="דורש בדיקה">⚠</span>}
                <span className="font-semibold" style={{ color: p.direction === "long" ? GREEN : p.direction === "short" ? RED : "var(--muted)" }}>{DIR[p.direction]}</span>
                <span style={{ color: "var(--border)" }}>|</span>
                <span><span className="text-[var(--muted)]">ממוצע כניסה: </span>{p.avg_entry_price != null ? p.avg_entry_price.toFixed(2) : "—"}</span>
                <span><span className="text-[var(--muted)]">ממוצע יציאה: </span>{p.avg_exit_price != null ? p.avg_exit_price.toFixed(2) : "—"}</span>
                {p.status === "open" && (
                  <span className="flex items-center gap-1">
                    <span className="text-[var(--muted)]">מחיר נוכחי:</span>
                    <EditableCurrentPrice asset={p.asset} value={p.current_price} />
                  </span>
                )}
                <span><span className="text-[var(--muted)]">סיכון: </span>{p.total_risk_percent.toFixed(2)}%</span>
                {anchorId && (canEdit || p.peak_price != null) && (
                  <span className="flex items-center gap-1">
                    <span className="text-[var(--muted)]">מחיר שיא:</span>
                    <EditablePeak signalId={anchorId} value={p.peak_price} />
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <div className="flex items-center gap-2 text-base font-bold tabular-nums">
                  <span className="text-xs font-normal text-[var(--muted)]">סך הכל</span>
                  <span style={{ color: plColor(total$) }}>{total$ != null ? money(total$) : "—"}</span>
                  <span className="font-normal text-[var(--muted)]">·</span>
                  <span style={{ color: plColor(totalPct) }}>{totalPct != null ? pct(totalPct) : "—"}</span>
                  <span className="font-normal text-[var(--muted)]">·</span>
                  <span style={{ color: plColor(totalR) }}>{totalR != null ? `${totalR.toFixed(2)}R` : "—"}</span>
                </div>
                <Badge result={result} partial={partial} />
                <DeleteButton onConfirm={() => deletePosition(p.signal_ids)} title="מחק את כל העסקה" label="מחק עסקה" />
              </div>
            </div>

            {/* Everything below the top line is hidden in compact view. */}
            {!compact && (
              <>
                {/* Aggregate metrics — always visible */}
                <div className="border-t border-[var(--border)] px-4 py-3">
                  <Summary p={p} />
                </div>

                {/* Prominent expand control */}
                <button
                  onClick={() => toggle(key)}
                  className="flex w-full items-center justify-center gap-2 border-t border-[var(--border)] py-3 text-sm font-bold tracking-wide transition-colors hover:brightness-125"
                  style={{ background: "rgba(56,189,248,0.16)", color: "#7dd3fc" }}
                >
                  {isOpen ? "סגור פירוט ▲" : "לחצו לפירוט מלא ▼"}
                </button>

                {/* Per-leg breakdown — on expand */}
                {isOpen && (
                  <div className="overflow-x-auto border-t border-[var(--border)] bg-[var(--panel-2)] p-3">
                    <LegsTable p={p} />
                  </div>
                )}
              </>
            )}
          </div>
        );
  }
}

function MonthHeader({ group }: { group: ReturnType<typeof groupByMonth>[number] }) {
  const total = group.realized + group.open;
  const totalColor = total > 0 ? GREEN : total < 0 ? RED : undefined;
  const realizedColor = group.realized > 0 ? GREEN : group.realized < 0 ? RED : undefined;
  const openColor = group.open > 0 ? GREEN : group.open < 0 ? RED : undefined;
  return (
    <div className="mt-3 first:mt-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-5 py-3" style={{ borderRightWidth: '4px', borderRightColor: ACCENT }}>
      <span className="text-lg font-bold">{group.name}</span>
      <span className="text-sm text-[var(--muted)]">·</span>
      <span className="text-base font-bold tabular-nums" style={{ color: totalColor }}>{money(total)}</span>
      <span className="text-xs text-[var(--muted)]">סך</span>
      <span className="text-sm text-[var(--muted)]">·</span>
      <span className="text-sm tabular-nums" style={{ color: realizedColor }}>{money(group.realized)} <span className="text-[var(--muted)] text-xs font-normal">ממומש</span></span>
      <span className="text-sm tabular-nums" style={{ color: openColor }}>{money(group.open)} <span className="text-[var(--muted)] text-xs font-normal">פתוח</span></span>
      <span className="text-sm text-[var(--muted)]">·</span>
      <span className="text-sm tabular-nums text-[var(--muted)]">{group.positions.length} עסקאות</span>
      <span className="text-sm tabular-nums text-[var(--muted)]">{group.wins} רווחים</span>
      <span className="text-sm tabular-nums text-[var(--muted)]">{group.losses} הפסדים</span>
      {group.openCount > 0 && <span className="text-sm tabular-nums text-[var(--muted)]">{group.openCount} פתוחות</span>}
    </div>
  );
}
