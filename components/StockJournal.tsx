"use client";

import { useMemo, useState, useTransition } from "react";
import type { StockTrade, StockTradeInput, StockLeg } from "@/types";
import { calcStockTrade } from "@/lib/stock-calc";
import { PositionsCharts } from "./PositionsCharts";
import { ProfitFactorHero } from "./ProfitFactorHero";
import { DeleteButton } from "./DeleteButton";
import { saveStockTrade, removeStockTrade } from "@/app/stocks/actions";
import { useCanEdit } from "@/components/EditMode";

const GREEN = "#22c55e";
const RED = "#ef4444";
const ACCENT = "#38bdf8";

function money(n: number | null): string {
  if (n == null || isNaN(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function pct(n: number | null): string {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function rstr(n: number | null): string {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}
function plColor(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? GREEN : RED;
}
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}


type LegForm = { p: string; q: string; f: string };
type Form = {
  trade_date: string; // YYYY-MM-DD
  symbol: string;
  direction: "long" | "short";
  risk: string;
  peak: string;
  entries: LegForm[];
  exits: LegForm[];
};

const emptyLegs = (): LegForm[] => Array.from({ length: 5 }, () => ({ p: "", q: "", f: "" }));
const blankForm = (): Form => ({
  trade_date: new Date().toISOString().slice(0, 10),
  symbol: "",
  direction: "long",
  risk: "",
  peak: "",
  entries: emptyLegs(),
  exits: emptyLegs(),
});

function legsToForm(legs: StockLeg[]): LegForm[] {
  const rows = emptyLegs();
  legs.forEach((l, i) => {
    if (i < 5) rows[i] = { p: String(l.p), q: String(l.q), f: String(l.f) };
  });
  return rows;
}
function formToLegs(rows: LegForm[]): StockLeg[] {
  const legs: StockLeg[] = [];
  for (const r of rows) {
    const p = parseFloat(r.p);
    const q = parseFloat(r.q);
    const f = parseFloat(r.f);
    if (!isNaN(p) && !isNaN(q) && q > 0) legs.push({ p, q, f: isNaN(f) ? 0 : f });
  }
  return legs;
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
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
      {s.t}{partial ? " · חלקי" : ""}
    </span>
  );
}

// Entry/exit legs of a stock trade (price × qty, fee) — shown when a card expands.
function LegRows({ title, legs }: { title: string; legs: StockLeg[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-2">
      <div className="mb-1 text-xs font-semibold text-[var(--muted)]">{title}</div>
      {legs.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">—</div>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-[var(--muted)]">
              <th className="py-1 text-right font-normal">מחיר</th>
              <th className="py-1 text-right font-normal">כמות</th>
              <th className="py-1 text-right font-normal">עמלה</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((l, idx) => (
              <tr key={idx} className="border-t border-[var(--border)]">
                <td className="py-1">${l.p.toFixed(2)}</td>
                <td className="py-1">{l.q.toLocaleString()}</td>
                <td className="py-1">${l.f.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StockJournal({ trades }: { trades: StockTrade[] }) {
  const canEdit = useCanEdit();
  const [busy, startTransition] = useTransition();
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSeq, setEditingSeq] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(blankForm());

  const rows = useMemo(
    () =>
      trades.map((t) => {
        const c = calcStockTrade(t);
        // Money left on the floor: extra profit missed by exiting below the peak.
        const lof =
          t.peak_price != null && c.totalQout > 0 && t.peak_price > c.avgExit
            ? (t.peak_price - c.avgExit) * c.totalQout
            : 0;
        return { t, c, lof };
      }),
    [trades],
  );
  const totalLeftOnFloor = rows.reduce((s, r) => s + r.lof, 0);

  // ── KPIs (closed trades only) ──
  const closed = rows.filter((r) => r.c.result !== "open");
  const wins = closed.filter((r) => r.c.result === "win");
  const losses = closed.filter((r) => r.c.result === "loss");
  const openRows = rows.filter((r) => r.c.result === "open");
  const totalPL = closed.reduce((s, r) => s + r.c.pl, 0);
  const sumWins = wins.reduce((s, r) => s + r.c.pl, 0);
  const sumLosses = losses.reduce((s, r) => s + r.c.pl, 0);
  const avgWin = wins.length ? sumWins / wins.length : 0;
  const avgLoss = losses.length ? sumLosses / losses.length : 0;
  const avgPL = closed.length ? totalPL / closed.length : 0;
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
  const profitFactor = sumLosses !== 0 ? sumWins / Math.abs(sumLosses) : null;
  let best: (typeof closed)[number] | null = null;
  let worst: (typeof closed)[number] | null = null;
  for (const r of closed) {
    if (!best || r.c.pl > best.c.pl) best = r;
    if (!worst || r.c.pl < worst.c.pl) worst = r;
  }

  // ── Chart datasets (reuse PositionsCharts) ──
  const closedByDate = [...closed].sort(
    (a, b) => a.t.trade_date.localeCompare(b.t.trade_date) || a.t.seq - b.t.seq,
  );
  let cum = 0;
  const equityPoints = closedByDate.map((r) => {
    cum += r.c.pl;
    return { label: `${r.t.symbol} ${isoToDisplay(r.t.trade_date).slice(0, 5)}`, value: Math.round(cum) };
  });
  const equity = closedByDate.length ? [{ label: "התחלה", value: 0 }, ...equityPoints] : equityPoints;
  const avgComparison = [
    { label: "רווח ממוצע", value: Math.round(avgWin) },
    { label: "הפסד ממוצע", value: Math.round(avgLoss) },
  ];
  const totals = [
    { label: "סך רווחים", value: Math.round(sumWins) },
    { label: "סך הפסדים", value: Math.round(sumLosses) },
  ];
  const perTrade = closed.map((r) => ({ label: `${r.t.symbol} ${isoToDisplay(r.t.trade_date).slice(0, 5)}`, pnl: Math.round(r.c.pl) }));
  const bySymMap = new Map<string, number>();
  for (const r of closed) bySymMap.set(r.t.symbol, (bySymMap.get(r.t.symbol) ?? 0) + r.c.pl);
  const byAsset = [...bySymMap.entries()].map(([label, pnl]) => ({ label, pnl: Math.round(pnl) })).sort((a, b) => b.pnl - a.pnl);

  const dates = trades.map((t) => t.trade_date).sort();
  const period = dates.length ? `${isoToDisplay(dates[0])} – ${isoToDisplay(dates[dates.length - 1])}` : "—";

  // live calc preview in the modal
  const previewLegs = { direction: form.direction, risk_dollars: parseFloat(form.risk) || 0, entries: formToLegs(form.entries), exits: formToLegs(form.exits) };
  const preview = calcStockTrade(previewLegs);

  function openNew() {
    setEditingId(null);
    setEditingSeq(null);
    setForm(blankForm());
    setOpen(true);
  }
  function openEdit(t: StockTrade) {
    setEditingId(t.id);
    setEditingSeq(t.seq);
    setForm({
      trade_date: t.trade_date,
      symbol: t.symbol,
      direction: t.direction,
      risk: String(t.risk_dollars),
      peak: t.peak_price != null ? String(t.peak_price) : "",
      entries: legsToForm(t.entries),
      exits: legsToForm(t.exits),
    });
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setEditingId(null);
  }
  function setLeg(kind: "entries" | "exits", idx: number, field: keyof LegForm, value: string) {
    setForm((f) => {
      const next = f[kind].map((r, i) => (i === idx ? { ...r, [field]: value } : r));
      return { ...f, [kind]: next };
    });
  }
  function submit() {
    if (!form.symbol.trim()) return;
    const input: StockTradeInput = {
      trade_date: form.trade_date,
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      risk_dollars: parseFloat(form.risk) || 0,
      entries: formToLegs(form.entries),
      exits: formToLegs(form.exits),
      seq: editingSeq ?? Number.MAX_SAFE_INTEGER,
      peak_price: form.peak.trim() !== "" && !isNaN(parseFloat(form.peak)) ? parseFloat(form.peak) : null,
    };
    startTransition(async () => {
      await saveStockTrade(editingId, input);
      close();
    });
  }
  function del() {
    if (!editingId) return;
    if (!confirm("למחוק את העסקה?")) return;
    startTransition(async () => {
      await removeStockTrade(editingId);
      close();
    });
  }

  const inputCls = "rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm outline-none";
  const inputStyle = { backgroundColor: "#15203a", color: "#e6ecf5" };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {canEdit ? (
          <button
            onClick={openNew}
            className="rounded-lg px-4 py-2 text-sm font-bold"
            style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#03131f" }}
          >
            + עסקה חדשה
          </button>
        ) : (
          <span />
        )}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
          תקופה: <strong className="text-[var(--text)]">{period}</strong> · סגורות: <strong className="text-[var(--text)]">{closed.length}</strong> · פתוחות: <strong className="text-[var(--accent)]">{openRows.length}</strong>
        </div>
      </div>

      <ProfitFactorHero profitFactor={profitFactor} grossWins={sumWins} grossLosses={sumLosses} closedCount={closed.length} winRate={winRate} wins={wins.length} losses={losses.length} />

      <section className="mb-6">
        <div className="rounded-2xl border-2 border-[var(--border)] p-4">
          <h3 className="mb-3 text-sm font-bold text-[var(--muted)]">ביצועים</h3>
          <div className="flex flex-col gap-4">
            {/* זוג: רווח/הפסד ממומש ↔ כסף שהושאר על הרצפה */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="סך רווח/הפסד (סגורות)" value={closed.length ? money(totalPL) : "—"} sub={closed.length ? `ממוצע לעסקה: ${money(avgPL)}` : undefined} color={plColor(closed.length ? totalPL : null)} />
              <Kpi label="כסף שהושאר על הרצפה" value={totalLeftOnFloor > 0 ? money(totalLeftOnFloor) : "—"} sub="פער מהשיא (בעסקאות שמילאת מחיר שיא)" color="var(--gold)" />
            </div>
            {/* זוג: ממוצע עסקה מרוויחה ↔ מפסידה */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="ממוצע עסקה מרוויחה" value={wins.length ? money(avgWin) : "—"} sub={`סה״כ רווחים: ${money(sumWins)}`} color={wins.length ? GREEN : undefined} />
              <Kpi label="ממוצע עסקה מפסידה" value={losses.length ? money(avgLoss) : "—"} sub={`סה״כ הפסדים: ${money(sumLosses)}`} color={losses.length ? RED : undefined} />
            </div>
            {/* זוג: העסקה הטובה ↔ הגרועה ביותר */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="העסקה הטובה ביותר" value={best ? money(best.c.pl) : "—"} sub={best ? `${best.t.symbol} · ${rstr(best.c.rr)}` : undefined} color={best ? GREEN : undefined} />
              <Kpi label="העסקה הגרועה ביותר" value={worst ? money(worst.c.pl) : "—"} sub={worst ? `${worst.t.symbol} · ${rstr(worst.c.rr)}` : undefined} color={worst ? RED : undefined} />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <PositionsCharts equity={equity} avgComparison={avgComparison} totals={totals} perTrade={perTrade} byAsset={byAsset} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">פירוט עסקאות</h2>
          <button
            onClick={() => setCompact((c) => !c)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[rgba(56,189,248,0.08)]"
          >
            {compact ? "▼ הצג תצוגה מלאה" : "▲ צמצם תצוגה (שורה ראשית בלבד)"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
            {rows.map(({ t, c, lof }, i) => {
              const border = c.result === "win" ? GREEN : c.result === "loss" ? RED : ACCENT;
              const isOpen = expanded.has(t.id);
              const isOpenTrade = c.result === "open";
              return (
                <div key={t.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]" style={{ boxShadow: `inset 4px 0 0 0 ${border}` }}>
                  {/* top line */}
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base tabular-nums">
                      <span className="text-sm text-[var(--muted)]">#{i + 1}</span>
                      <span className="text-sm text-[var(--muted)]">{isoToDisplay(t.trade_date)}</span>
                      <span className="text-xl font-bold">{t.symbol}</span>
                      <span className="font-semibold" style={{ color: t.direction === "long" ? GREEN : RED }}>{t.direction === "long" ? "לונג" : "שורט"}</span>
                      {c.partial && <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>חלקי</span>}
                      <span style={{ color: "var(--border)" }}>|</span>
                      <span><span className="text-[var(--muted)]">ממוצע כניסה: </span>{c.totalQin > 0 ? `$${c.avgEntry.toFixed(2)}` : "—"}</span>
                      <span><span className="text-[var(--muted)]">ממוצע יציאה: </span>{c.totalQout > 0 ? `$${c.avgExit.toFixed(2)}` : "—"}</span>
                      <span><span className="text-[var(--muted)]">סיכון: </span>{money(t.risk_dollars)}</span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
                      <div className="flex items-center gap-2 text-base font-bold tabular-nums">
                        <span className="text-xs font-normal text-[var(--muted)]">סך הכל</span>
                        <span style={{ color: isOpenTrade ? undefined : plColor(c.pl) }}>{isOpenTrade ? "—" : money(c.pl)}</span>
                        <span className="font-normal text-[var(--muted)]">·</span>
                        <span style={{ color: isOpenTrade ? undefined : plColor(c.pct) }}>{isOpenTrade ? "—" : pct(c.pct)}</span>
                        <span className="font-normal text-[var(--muted)]">·</span>
                        <span style={{ color: isOpenTrade ? undefined : plColor(c.rr) }}>{isOpenTrade ? "—" : rstr(c.rr)}</span>
                      </div>
                      <Badge result={c.result} partial={c.partial} />
                      {canEdit && (
                        <button onClick={() => openEdit(t)} className="rounded px-2 py-1 text-xs" style={{ color: ACCENT, border: "1px solid var(--border)" }}>✏ ערוך</button>
                      )}
                      <DeleteButton onConfirm={() => removeStockTrade(t.id)} title="מחק עסקה" />
                    </div>
                  </div>

                  {!compact && (
                    <>
                      <div className="border-t border-[var(--border)] px-5 py-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm tabular-nums sm:grid-cols-4">
                          <div><span className="text-[var(--muted)]">פוזיציה $: </span>{money(c.positionDollar)}</div>
                          <div><span className="text-[var(--muted)]">עמלות: </span>{money(c.fees)}</div>
                          <div><span className="text-[var(--muted)]">כמות נכנסת: </span>{c.totalQin.toLocaleString()}</div>
                          <div><span className="text-[var(--muted)]">כמות יצאת: </span>{c.totalQout.toLocaleString()}</div>
                        </div>
                        {t.peak_price != null && (
                          <div className="mt-2 text-sm tabular-nums">
                            <span className="text-[var(--muted)]">הושאר על הרצפה: </span>
                            <span className="font-bold" style={{ color: "var(--gold)" }}>{money(lof)}</span>
                            <span className="text-[var(--muted)]"> (שיא ${t.peak_price} · יצאת בממוצע ${c.avgExit.toFixed(2)})</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => toggleExpand(t.id)}
                        className="flex w-full items-center justify-center gap-2 border-t border-[var(--border)] py-3 text-sm font-bold tracking-wide transition-colors hover:brightness-125"
                        style={{ background: "rgba(56,189,248,0.16)", color: "#7dd3fc" }}
                      >
                        {isOpen ? "סגור פירוט ▲" : "לחצו לפירוט מלא ▼"}
                      </button>

                      {isOpen && (
                        <div className="border-t border-[var(--border)] bg-[var(--panel-2)] p-3">
                          <div className="grid gap-4 md:grid-cols-2">
                            <LegRows title="כניסות (קניות)" legs={t.entries} />
                            <LegRows title="יציאות (מכירות)" legs={t.exits} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6" style={{ background: "rgba(2,6,16,0.78)" }} onClick={close}>
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border)] p-6" style={{ backgroundColor: "#0f1830", color: "#e6ecf5" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingId ? `עריכת עסקה (${form.symbol})` : "עסקה חדשה"}</h2>
              <button onClick={close} className="rounded-md px-2 py-1 text-[var(--muted)]" style={{ border: "1px solid var(--border)" }}>✕</button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">תאריך
                <input type="date" value={form.trade_date} onChange={(e) => setForm({ ...form, trade_date: e.target.value })} className={inputCls} style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">סימבול
                <input type="text" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="AAPL" className={inputCls} style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">כיוון
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "long" | "short" })} className={inputCls} style={inputStyle}>
                  <option value="long">לונג</option>
                  <option value="short">שורט</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">סיכון $
                <input type="number" step="0.01" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} placeholder="400" className={inputCls} style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">מחיר שיא (אופציונלי)
                <input type="number" step="any" value={form.peak} onChange={(e) => setForm({ ...form, peak: e.target.value })} placeholder="לכמה הגיעה אחרי שיצאת" className={inputCls} style={inputStyle} />
              </label>
            </div>

            <div className="mb-4 grid gap-4 md:grid-cols-2">
              {(["entries", "exits"] as const).map((kind) => (
                <div key={kind} className="rounded-xl border border-[var(--border)] p-3" style={{ backgroundColor: "#15203a" }}>
                  <h4 className="mb-2 text-sm font-semibold">{kind === "entries" ? "כניסות (קניות)" : "יציאות (מכירות)"}</h4>
                  <div className="mb-1 grid grid-cols-3 gap-2 px-1 text-[11px] text-[var(--muted)]"><span>מחיר</span><span>כמות</span><span>עמלה $</span></div>
                  <div className="flex flex-col gap-1.5">
                    {form[kind].map((leg, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2">
                        <input type="number" step="any" placeholder="0.00" value={leg.p} onChange={(e) => setLeg(kind, idx, "p", e.target.value)} className={`${inputCls} text-xs`} style={{ backgroundColor: "#0f1830", color: "#e6ecf5" }} />
                        <input type="number" step="1" placeholder="0" value={leg.q} onChange={(e) => setLeg(kind, idx, "q", e.target.value)} className={`${inputCls} text-xs`} style={{ backgroundColor: "#0f1830", color: "#e6ecf5" }} />
                        <input type="number" step="any" placeholder="0.00" value={leg.f} onChange={(e) => setLeg(kind, idx, "f", e.target.value)} className={`${inputCls} text-xs`} style={{ backgroundColor: "#0f1830", color: "#e6ecf5" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] p-3 md:grid-cols-4" style={{ backgroundColor: "#15203a" }}>
              <div><div className="text-[11px] text-[var(--muted)]">ממוצע כניסה</div><div className="text-base font-bold tabular-nums">{preview.totalQin > 0 ? `$${preview.avgEntry.toFixed(2)}` : "—"}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">ממוצע יציאה</div><div className="text-base font-bold tabular-nums">{preview.totalQout > 0 ? `$${preview.avgExit.toFixed(2)}` : "—"}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">כמות נכנסת / יצאת</div><div className="text-base font-bold tabular-nums">{preview.totalQin.toLocaleString()} / {preview.totalQout.toLocaleString()}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">פוזיציה $</div><div className="text-base font-bold tabular-nums">{money(preview.positionDollar)}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">סך עמלות</div><div className="text-base font-bold tabular-nums">{money(preview.fees)}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">P/L $</div><div className="text-base font-bold tabular-nums" style={{ color: preview.totalQout > 0 ? plColor(preview.pl) : undefined }}>{preview.totalQout > 0 ? money(preview.pl) : "—"}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">תשואה %</div><div className="text-base font-bold tabular-nums" style={{ color: preview.totalQout > 0 ? plColor(preview.pct) : undefined }}>{preview.totalQout > 0 ? pct(preview.pct) : "—"}</div></div>
              <div><div className="text-[11px] text-[var(--muted)]">R/R</div><div className="text-base font-bold tabular-nums" style={{ color: preview.totalQout > 0 ? plColor(preview.rr) : undefined }}>{preview.totalQout > 0 ? rstr(preview.rr) : "—"}</div></div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {editingId && (
                  <button onClick={del} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: "#b91c1c", color: "#fff", opacity: busy ? 0.5 : 1 }}>מחק עסקה</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={close} disabled={busy} className="rounded-lg px-4 py-2 text-sm" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>ביטול</button>
                <button onClick={submit} disabled={busy} className="rounded-lg px-5 py-2 text-sm font-bold" style={{ background: GREEN, color: "#052e16", opacity: busy ? 0.5 : 1 }}>שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
