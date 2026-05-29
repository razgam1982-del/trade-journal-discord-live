"use client";

import { Fragment, useState } from "react";
import type { Position, PositionLeg } from "@/types";
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

const TH = "sticky top-0 bg-[var(--panel-2)] px-3 py-2.5 text-right text-xs font-semibold text-[var(--muted)] whitespace-nowrap border-b border-[var(--border)]";
const TD = "px-3 py-4 border-b border-[var(--border)] whitespace-nowrap align-middle";

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

function LegsDetail({ p }: { p: Position }) {
  const realized$ = p.pnl_dollars;
  const open$ = p.unrealized_pnl_dollars;
  const total$ = realized$ != null || open$ != null ? (realized$ ?? 0) + (open$ ?? 0) : null;
  const totalPct =
    p.pnl_percent != null || p.unrealized_pnl_percent != null ? (p.pnl_percent ?? 0) + (p.unrealized_pnl_percent ?? 0) : null;
  const totalR = p.r_achieved != null || p.unrealized_r != null ? (p.r_achieved ?? 0) + (p.unrealized_r ?? 0) : null;
  return (
    <div className="bg-[var(--panel-2)] p-3">
      <div className="mb-2 flex justify-end">
        <DeleteButton onConfirm={() => deletePosition(p.legs.map((l) => l.signal_id))} title="מחק את כל העסקה" label="מחק עסקה שלמה" />
      </div>
      <div className="mb-3 flex flex-col gap-1 text-sm tabular-nums">
        <div className="font-semibold">
          <span className="text-[var(--muted)]">רווח/הפסד ממומש</span>
          {p.closed_fraction > 0 && (
            <span className="ms-2 rounded px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>ממומש {Math.round(p.closed_fraction * 100)}%</span>
          )}
        </div>
        <div className="ms-3 flex flex-col gap-0.5">
          <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-semibold" style={{ color: plColor(p.pnl_dollars) }}>{p.pnl_dollars != null ? money(p.pnl_dollars) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: plColor(p.pnl_percent) }}>{p.pnl_percent != null ? pct(p.pnl_percent) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: plColor(p.r_achieved) }}>{p.r_achieved != null ? `${p.r_achieved.toFixed(2)}R` : "—"}</span></div>
        </div>
        {p.status === "open" && (
          <>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[var(--muted)]">מחיר נוכחי:</span>
              <EditableCurrentPrice asset={p.asset} value={p.current_price} />
            </div>
            <div className="font-semibold text-[var(--muted)]">רווח/הפסד פתוח</div>
            <div className="ms-3 flex flex-col gap-0.5">
              <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-semibold" style={{ color: plColor(p.unrealized_pnl_dollars) }}>{p.unrealized_pnl_dollars != null ? money(p.unrealized_pnl_dollars) : "הזן מחיר נוכחי כדי לחשב"}</span></div>
              <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: plColor(p.unrealized_pnl_percent) }}>{p.unrealized_pnl_percent != null ? pct(p.unrealized_pnl_percent) : "—"}</span></div>
              <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: plColor(p.unrealized_r) }}>{p.unrealized_r != null ? `${p.unrealized_r.toFixed(2)}R` : "—"}</span></div>
            </div>
          </>
        )}
        <div className="mt-1 border-t border-[var(--border)] pt-1 font-semibold">סך הכל (ממומש + פתוח)</div>
        <div className="ms-3 flex flex-col gap-0.5">
          <div><span className="text-[var(--muted)]">סכום $: </span><span className="font-bold" style={{ color: plColor(total$) }}>{total$ != null ? money(total$) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">תשואה %: </span><span style={{ color: plColor(totalPct) }}>{totalPct != null ? pct(totalPct) : "—"}</span></div>
          <div><span className="text-[var(--muted)]">יחס סיכון (R): </span><span style={{ color: plColor(totalR) }}>{totalR != null ? `${totalR.toFixed(2)}R` : "—"}</span></div>
        </div>
        {p.potential_rr != null && (
          <>
            <div className="mt-1 border-t border-[var(--border)] pt-1 font-semibold text-[var(--muted)]">פוטנציאל עסקה (עד הטייק־פרופיט, על החלק הפתוח)</div>
            <div className="ms-3 flex flex-col gap-0.5">
              <div>
                <span className="text-[var(--muted)]">רווח פוטנציאלי: </span>
                <span className="font-semibold" style={{ color: GREEN }}>{p.potential_profit_dollars != null ? money(p.potential_profit_dollars) : "—"}</span>
                <span className="text-[var(--muted)]"> · </span>
                <span style={{ color: GREEN }}>{p.potential_profit_percent != null ? pct(p.potential_profit_percent) : "—"}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">הפסד פוטנציאלי: </span>
                <span className="font-semibold" style={{ color: RED }}>{p.potential_loss_dollars != null ? money(p.potential_loss_dollars) : "—"}</span>
                <span className="text-[var(--muted)]"> · </span>
                <span style={{ color: RED }}>{p.potential_loss_percent != null ? pct(p.potential_loss_percent) : "—"}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">יחס סיכוי/סיכון: </span>
                <span className="font-bold">{`1:${p.potential_rr.toFixed(2)}`}</span>
              </div>
            </div>
          </>
        )}
      </div>
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
    </div>
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
    <div className="overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={TH}>#</th>
            <th className={TH}>תאריך</th>
            <th className={TH}>נכס</th>
            <th className={TH}>כיוון</th>
            <th className={TH}>ממוצע כניסה</th>
            <th className={TH}>ממוצע יציאה</th>
            <th className={TH}>מחיר נוכחי</th>
            <th className={TH}>סיכון %</th>
            <th className={TH}>R</th>
            <th className={TH}>ממומש $</th>
            <th className={TH}>פתוח $</th>
            <th className={TH}>סך הכל $</th>
            <th className={TH}>תשואה %</th>
            <th className={TH}>תוצאה</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const result = p.status === "open" ? "open" : (p.pnl_dollars ?? 0) >= 0 ? "win" : "loss";
            const border = result === "win" ? GREEN : result === "loss" ? RED : ACCENT;
            const key = p.key + p.opened_at;
            const isOpen = expanded.has(key);
            const partial = p.status === "open" && p.legs.some((l) => l.kind === "reduce" || l.kind === "close");
            // Realized + unrealized shown separately, plus their combined total.
            const realized$ = p.pnl_dollars;
            const open$ = p.unrealized_pnl_dollars;
            const hasAnyPnl = realized$ != null || open$ != null;
            const total$ = hasAnyPnl ? (realized$ ?? 0) + (open$ ?? 0) : null;
            const hasPct = p.pnl_percent != null || p.unrealized_pnl_percent != null;
            const totalPct = hasPct ? (p.pnl_percent ?? 0) + (p.unrealized_pnl_percent ?? 0) : null;
            const hasR = p.r_achieved != null || p.unrealized_r != null;
            const totalR = hasR ? (p.r_achieved ?? 0) + (p.unrealized_r ?? 0) : null;
            return (
              <Fragment key={key}>
                <tr
                  onClick={() => toggle(key)}
                  className="cursor-pointer hover:bg-[rgba(56,189,248,0.04)]"
                  style={{ boxShadow: `inset 4px 0 0 0 ${border}` }}
                >
                  <td className={`${TD} text-[var(--muted)] tabular-nums`}>{i + 1}</td>
                  <td className={`${TD} text-[var(--muted)] tabular-nums`}>{fmtDate(p.opened_at)}</td>
                  <td className={`${TD} font-semibold`}>
                    {p.asset}
                    {p.needs_review && <span className="mr-1 text-[10px]" style={{ color: "var(--gold)" }}>⚠</span>}
                  </td>
                  <td className={TD} style={{ color: p.direction === "long" ? GREEN : p.direction === "short" ? RED : "var(--muted)" }}>
                    {DIR[p.direction]}
                  </td>
                  <td className={`${TD} tabular-nums`}>{p.avg_entry_price != null ? p.avg_entry_price.toFixed(2) : "—"}</td>
                  <td className={`${TD} tabular-nums`}>{p.avg_exit_price != null ? p.avg_exit_price.toFixed(2) : "—"}</td>
                  <td className={`${TD} tabular-nums`} onClick={(e) => e.stopPropagation()}>
                    {p.status === "open" ? <EditableCurrentPrice asset={p.asset} value={p.current_price} /> : "—"}
                  </td>
                  <td className={`${TD} tabular-nums`}>{p.total_risk_percent.toFixed(2)}%</td>
                  <td className={`${TD} tabular-nums`}>
                    {!hasR ? (
                      "—"
                    ) : (
                      <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
                        <div>
                          <span className="text-[var(--muted)]">ממומש </span>
                          <span style={{ color: plColor(p.r_achieved) }}>{p.r_achieved != null ? `${p.r_achieved.toFixed(2)}R` : "—"}</span>
                        </div>
                        {p.unrealized_r != null && (
                          <>
                            <div>
                              <span className="text-[var(--muted)]">פתוח </span>
                              <span style={{ color: plColor(p.unrealized_r) }}>{`${p.unrealized_r.toFixed(2)}R`}</span>
                            </div>
                            <div className="border-t border-[var(--border)] pt-1.5">
                              <span className="text-[var(--muted)]">סך </span>
                              <span className="font-bold" style={{ color: plColor(totalR) }}>{totalR != null ? `${totalR.toFixed(2)}R` : "—"}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums font-semibold`} style={{ color: plColor(realized$) }}>{realized$ != null ? money(realized$) : "—"}</td>
                  <td className={`${TD} tabular-nums font-semibold`} style={{ color: plColor(open$) }}>{open$ != null ? money(open$) : "—"}</td>
                  <td className={`${TD} tabular-nums font-bold`} style={{ color: plColor(total$) }}>{total$ != null ? money(total$) : "—"}</td>
                  <td className={`${TD} tabular-nums`} style={{ color: plColor(totalPct) }}>{totalPct != null ? pct(totalPct) : "—"}</td>
                  <td className={TD}><Badge result={result} partial={partial} /></td>
                  <td className={`${TD} text-[var(--muted)]`}>{isOpen ? "▲" : "▼"}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={15} className="border-b border-[var(--border)] p-0">
                      <LegsDetail p={p} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
