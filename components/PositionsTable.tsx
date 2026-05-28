"use client";

import { Fragment, useState } from "react";
import type { Position, PositionLeg } from "@/types";
import { EditablePrice } from "./EditablePrice";
import { ExcludeToggle } from "./ExcludeToggle";
import { EditSignalButton } from "./EditSignalButton";
import { EditableCurrentPrice } from "./EditableCurrentPrice";
import { FilledToggle } from "./FilledToggle";

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
function effPnl(p: Position): number | null {
  return p.pnl_dollars ?? p.unrealized_pnl_dollars ?? null;
}
function effPct(p: Position): number | null {
  return p.pnl_percent ?? p.unrealized_pnl_percent ?? null;
}
function effR(p: Position): number | null {
  return p.r_achieved ?? p.unrealized_r ?? null;
}

const TH = "sticky top-0 bg-[var(--panel-2)] px-3 py-2.5 text-right text-xs font-semibold text-[var(--muted)] whitespace-nowrap border-b border-[var(--border)]";
const TD = "px-3 py-2.5 border-b border-[var(--border)] whitespace-nowrap";

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
  return (
    <div className="bg-[var(--panel-2)] p-3">
      {p.status === "open" && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-[var(--muted)]">מחיר נוכחי:</span>
          <EditableCurrentPrice asset={p.asset} value={p.current_price} />
          <span className="text-[var(--border)]">|</span>
          <span className="text-[var(--muted)]">רווח פתוח:</span>
          <span className="font-semibold tabular-nums" style={{ color: plColor(p.unrealized_pnl_dollars) }}>
            {p.unrealized_pnl_dollars != null
              ? `${money(p.unrealized_pnl_dollars)} · ${pct(p.unrealized_pnl_percent)} · ${p.unrealized_r != null ? p.unrealized_r.toFixed(2) + "R" : "—"}`
              : "הזן מחיר נוכחי כדי לחשב"}
          </span>
        </div>
      )}
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {["תאריך", "סוג", "פרט", "מחיר", "סיכון", ""].map((h, i) => (
              <th key={i} className="border-b border-[var(--border)] px-2 py-1.5 text-right text-xs text-[var(--muted)]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.legs.map((leg) => {
            const struck = leg.excluded
              ? { textDecoration: "line-through" as const, opacity: 0.45 }
              : leg.pending
                ? { opacity: 0.6 }
                : undefined;
            const isLimitEntry = leg.kind === "entry" && (leg.entry_type === "limit" || leg.entry_type === "trigger");
            const detail =
              leg.kind === "entry"
                ? leg.entry_type
                  ? ETYPE[leg.entry_type] ?? leg.entry_type
                  : "כניסה"
                : leg.quantity_text ?? LEG[leg.kind];
            return (
              <tr key={leg.signal_id}>
                <td className="border-b border-[var(--border)] px-2 py-1.5 text-[var(--muted)] tabular-nums whitespace-nowrap" style={struck}>{fmtTime(leg.date)}</td>
                <td className="border-b border-[var(--border)] px-2 py-1.5" style={struck}>{LEG[leg.kind]}</td>
                <td className="border-b border-[var(--border)] px-2 py-1.5" style={struck}>
                  {detail}
                  {leg.pending && (
                    <span className="ms-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>ממתין</span>
                  )}
                </td>
                <td className="border-b border-[var(--border)] px-1 py-1" style={struck}>
                  {leg.kind === "cancel" ? <span className="px-2 text-[var(--muted)]">—</span> : <EditablePrice signalId={leg.signal_id} kind={leg.kind} value={leg.price} />}
                </td>
                <td className="border-b border-[var(--border)] px-2 py-1.5 tabular-nums" style={struck}>{leg.risk_percent != null ? `${leg.risk_percent}%` : "—"}</td>
                <td className="border-b border-[var(--border)] px-1 py-1 text-left whitespace-nowrap">
                  {isLimitEntry && <FilledToggle signalId={leg.signal_id} pending={leg.pending} />}
                  {leg.discord_url && (
                    <a href={leg.discord_url} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 text-xs" style={{ color: ACCENT }} title="פתח בדיסקורד">↗</a>
                  )}
                  <EditSignalButton signalId={leg.signal_id} />
                  <ExcludeToggle signalId={leg.signal_id} excluded={leg.excluded} />
                </td>
              </tr>
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
            <th className={TH}>סיכון %</th>
            <th className={TH}>R</th>
            <th className={TH}>רווח/הפסד $</th>
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
            const pnl = effPnl(p);
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
                  <td className={`${TD} tabular-nums`}>{p.total_risk_percent.toFixed(2)}%</td>
                  <td className={`${TD} tabular-nums`} style={{ color: plColor(pnl) }}>{effR(p) != null ? `${effR(p)!.toFixed(2)}R` : "—"}</td>
                  <td className={`${TD} tabular-nums font-semibold`} style={{ color: plColor(pnl) }}>{money(pnl)}</td>
                  <td className={`${TD} tabular-nums`} style={{ color: plColor(pnl) }}>{pct(effPct(p))}</td>
                  <td className={TD}><Badge result={result} partial={partial} /></td>
                  <td className={`${TD} text-[var(--muted)]`}>{isOpen ? "▲" : "▼"}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={12} className="border-b border-[var(--border)] p-0">
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
