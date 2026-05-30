import Link from "next/link";
import { getPositions } from "@/services/position-service";
import { getPortfolioSize } from "@/services/settings-service";
import { listChannels } from "@/services/channel-service";
import { fetchBenchmarkSeries, spxPctAt } from "@/services/benchmark-service";
import { OpenTradeButton } from "@/components/OpenTradeButton";
import { listStockTrades, listDeletedStockTrades } from "@/services/stock-trade-service";
import { listDeletedSignals } from "@/services/trade-signal-service";
import { restoreSignal } from "@/app/positions/actions";
import { restoreStockTradeAction } from "@/app/stocks/actions";
import { EditablePortfolioSize } from "@/components/EditablePortfolioSize";
import { PositionsCharts } from "@/components/PositionsCharts";
import { PositionsTable } from "@/components/PositionsTable";
import { StockJournal } from "@/components/StockJournal";
import { RecycleBin } from "@/components/RecycleBin";
import { ProfitFactorHero } from "@/components/ProfitFactorHero";
import { Disclaimer } from "@/components/Disclaimer";
import { EditModeProvider } from "@/components/EditMode";
import { isEditor } from "@/lib/edit-auth";

const DIR_HE: Record<string, string> = { long: "לונג", short: "שורט" };
const ACTION_HE: Record<string, string> = {
  entry: "כניסה", add: "הוספה", reduce: "הפחתה", close: "סגירה",
  stop_update: "עדכון סטופ", cancel: "ביטול", fill: "מילוי", other: "אחר",
};

function ChannelTabs({ channels, selected }: { channels: { channel_id: string; name: string }[]; selected?: string }) {
  if (channels.length <= 1) return null;
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {channels.map((c) => (
        <Link
          key={c.channel_id}
          href={`/positions?channel=${c.channel_id}`}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={
            c.channel_id === selected
              ? { background: "var(--accent)", color: "#03131f", borderColor: "var(--accent)" }
              : { borderColor: "var(--border)", color: "var(--muted)" }
          }
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}

export const dynamic = "force-dynamic";

function money(n: number | null): string {
  if (n == null) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function pct(n: number | null): string {
  return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function pnlColor(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? "var(--green)" : "var(--red)";
}
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; lev?: string }>;
}) {
  const { channel, lev: levRaw } = await searchParams;
  // Leverage multiplier: 1 (default), 2, or 3. Applied to all P/L and % values
  // so the user can "what-if" doubling/tripling the per-trade risk size.
  const lev = (() => {
    const n = parseInt(levRaw ?? "1", 10);
    return n === 2 || n === 3 ? n : 1;
  })();
  const channels = await listChannels();
  const selected =
    channel && channels.some((c) => c.channel_id === channel) ? channel : channels[0]?.channel_id;
  const selectedChannel = channels.find((c) => c.channel_id === selected);
  const canEdit = await isEditor();

  // The stocks channel uses a separate shares/price/fees journal.
  if (selectedChannel?.template === "momentum_stocks") {
    const trades = await listStockTrades(selected);
    const deletedTrades = canEdit ? await listDeletedStockTrades(selected) : [];
    return (
      <EditModeProvider canEdit={canEdit}>
      <main className="mx-auto w-full max-w-[1320px] px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{selectedChannel.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            <Link href="/" className="underline" style={{ color: "var(--accent)" }}>← כל היומנים</Link>{" "}
            · יומן סימולציות לימודי למניות — כמות/מחיר/עמלות · רווח/הפסד ב-$ ו-R
          </p>
        </header>
        <ChannelTabs channels={channels} selected={selected} />
        <Disclaimer />
        <StockJournal trades={trades} />
        <RecycleBin
          heading="סל מיחזור — עסקאות שנמחקו"
          items={deletedTrades.map((t) => ({
            id: t.id,
            title: `${t.symbol} · ${DIR_HE[t.direction]}`,
            sub: `${t.trade_date} · סיכון $${t.risk_dollars}`,
          }))}
          onRestore={restoreStockTradeAction}
        />
      </main>
      </EditModeProvider>
    );
  }

  const [positionsRaw, portfolioSize] = await Promise.all([getPositions(selected), getPortfolioSize()]);
  // Apply the leverage multiplier to every $-and-% field. Note: stops/TPs are
  // unchanged because they're price levels; only the position SIZE scales.
  const positions = lev === 1 ? positionsRaw : positionsRaw.map((p) => ({
    ...p,
    pnl_dollars: p.pnl_dollars != null ? p.pnl_dollars * lev : null,
    pnl_percent: p.pnl_percent != null ? p.pnl_percent * lev : null,
    unrealized_pnl_dollars: p.unrealized_pnl_dollars != null ? p.unrealized_pnl_dollars * lev : null,
    unrealized_pnl_percent: p.unrealized_pnl_percent != null ? p.unrealized_pnl_percent * lev : null,
    total_risk_percent: p.total_risk_percent * lev,
    potential_profit_percent: p.potential_profit_percent != null ? p.potential_profit_percent * lev : null,
    left_on_floor_dollars: p.left_on_floor_dollars != null ? p.left_on_floor_dollars * lev : null,
    left_on_floor_percent: p.left_on_floor_percent != null ? p.left_on_floor_percent * lev : null,
    left_on_floor_r: p.left_on_floor_r,
    r_achieved: p.r_achieved, // R is leverage-invariant
    unrealized_r: p.unrealized_r,
  }));
  const deletedSignals = canEdit ? await listDeletedSignals() : [];

  const openPositions = positions.filter((p) => p.status === "open");
  const openCount = openPositions.length;

  // Realized metrics (closed positions with computed P/L).
  const realized = positions.filter((p) => p.pnl_dollars != null);
  const wins = realized.filter((p) => (p.pnl_dollars ?? 0) > 0);
  const losses = realized.filter((p) => (p.pnl_dollars ?? 0) < 0);
  const totalPnl = realized.reduce((s, p) => s + (p.pnl_dollars ?? 0), 0);
  const totalPnlPct = realized.reduce((s, p) => s + (p.pnl_percent ?? 0), 0);
  const avgPnl = realized.length ? totalPnl / realized.length : 0;
  const sumWins = wins.reduce((s, p) => s + (p.pnl_dollars ?? 0), 0);
  const sumLosses = losses.reduce((s, p) => s + (p.pnl_dollars ?? 0), 0); // negative
  const avgWin = wins.length ? sumWins / wins.length : 0;
  const avgLoss = losses.length ? sumLosses / losses.length : 0;
  const winRate = wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : null;
  const profitFactor = sumLosses !== 0 ? sumWins / Math.abs(sumLosses) : null;
  let best: (typeof realized)[number] | null = null;
  let worst: (typeof realized)[number] | null = null;
  for (const p of realized) {
    if (!best || (p.pnl_dollars ?? 0) > (best.pnl_dollars ?? 0)) best = p;
    if (!worst || (p.pnl_dollars ?? 0) < (worst.pnl_dollars ?? 0)) worst = p;
  }
  const openRisk = openPositions.reduce((s, p) => s + p.total_risk_percent, 0);
  const openPotential = openPositions.reduce((s, p) => s + (p.potential_profit_percent ?? 0), 0);
  const openPotentialCount = openPositions.filter((p) => p.potential_profit_percent != null).length;
  const totalLeftOnFloor = positions.reduce((s, p) => s + (p.left_on_floor_dollars ?? 0), 0);
  const openUnrealized = openPositions.reduce((s, p) => s + (p.unrealized_pnl_dollars ?? 0), 0);
  const openUnrealizedPct = openPositions.reduce((s, p) => s + (p.unrealized_pnl_percent ?? 0), 0);
  const hasUnrealized = openPositions.some((p) => p.unrealized_pnl_dollars != null);
  const r = (p: { r_achieved: number | null } | null) => (p?.r_achieved != null ? ` · ${p.r_achieved.toFixed(2)}R` : "");

  // Chart data. Effective P/L = realized if closed, else unrealized.
  const eff = (p: (typeof positions)[number]) => p.pnl_dollars ?? p.unrealized_pnl_dollars ?? null;
  const equity: { label: string; value: number; pct: number; date: string; spxPct?: number | null }[] = [];
  const sortedRealized = [...realized].sort((a, b) => (a.closed_at ?? a.opened_at).localeCompare(b.closed_at ?? b.opened_at));
  const firstDate = sortedRealized[0]?.closed_at ?? sortedRealized[0]?.opened_at ?? new Date().toISOString();
  if (realized.length) equity.push({ label: "התחלה", value: 0, pct: 0, date: firstDate, spxPct: 0 });
  let cum = 0;
  for (const p of sortedRealized) {
    cum += p.pnl_dollars ?? 0;
    equity.push({
      label: `${p.asset} ${shortDate(p.closed_at ?? p.opened_at)}`,
      value: Math.round(cum),
      pct: (cum / portfolioSize) * 100,
      date: p.closed_at ?? p.opened_at,
    });
  }
  // Overlay SPX benchmark (^GSPC). Each equity point gets the SPX % return
  // from the inception date snapped to its trade-close date.
  const lastDate = equity[equity.length - 1]?.date ?? new Date().toISOString();
  const spxSeries = await fetchBenchmarkSeries("^GSPC", firstDate, lastDate);
  for (const e of equity) e.spxPct = spxPctAt(spxSeries, e.date);
  const spxEndPct = equity[equity.length - 1]?.spxPct ?? null;
  // Compute SPX daily Sharpe/Sortino for comparison context.
  let spxSharpe: number | null = null;
  let spxSortino: number | null = null;
  if (spxSeries.length >= 3) {
    const spxDailyReturns: number[] = [];
    for (let i = 1; i < spxSeries.length; i++) {
      const prev = spxSeries[i - 1].pct;
      const curr = spxSeries[i].pct;
      // pct here is cumulative; daily return = (1+curr/100)/(1+prev/100) - 1
      spxDailyReturns.push((((1 + curr / 100) / (1 + prev / 100)) - 1) * 100);
    }
    const m = spxDailyReturns.reduce((s, v) => s + v, 0) / spxDailyReturns.length;
    const v = spxDailyReturns.reduce((s, x) => s + (x - m) ** 2, 0) / (spxDailyReturns.length - 1);
    const std = Math.sqrt(v);
    spxSharpe = std > 0 ? m / std : null;
    const dn = spxDailyReturns.filter((x) => x < 0).map((x) => (x - m) ** 2);
    const dStd = dn.length ? Math.sqrt(dn.reduce((s, x) => s + x, 0) / dn.length) : 0;
    spxSortino = dStd > 0 ? m / dStd : null;
  }

  // Sharpe / Sortino on per-trade % returns (annualization is left out — these
  // are intra-period stats for a small sample, more honest as raw ratios).
  const tradeReturns = sortedRealized.map((p) => p.pnl_percent ?? 0);
  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (tradeReturns.length >= 2) {
    const mean = tradeReturns.reduce((s, v) => s + v, 0) / tradeReturns.length;
    const variance = tradeReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (tradeReturns.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? mean / std : null;
    const downsides = tradeReturns.filter((v) => v < 0).map((v) => (v - mean) ** 2);
    const downsideStd = downsides.length ? Math.sqrt(downsides.reduce((s, v) => s + v, 0) / downsides.length) : 0;
    sortino = downsideStd > 0 ? mean / downsideStd : null;
  }
  // Per-trade chart: oldest on left, newest on right (chronological L→R).
  const perTrade = [...positions]
    .filter((p) => eff(p) != null)
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))
    .map((p) => ({ label: `${p.asset} ${shortDate(p.opened_at)}`, pnl: Math.round(eff(p) as number) }));
  const byAssetMap = new Map<string, number>();
  for (const p of positions) {
    const v = eff(p);
    if (v != null) byAssetMap.set(p.asset, (byAssetMap.get(p.asset) ?? 0) + v);
  }
  const byAsset = [...byAssetMap.entries()].map(([asset, pnl]) => ({ label: asset, pnl: Math.round(pnl) }));
  const avgComparison = [
    { label: "רווח ממוצע", value: Math.round(avgWin) },
    { label: "הפסד ממוצע", value: Math.round(avgLoss) },
  ];
  const totals = [
    { label: "סך רווחים", value: Math.round(sumWins) },
    { label: "סך הפסדים", value: Math.round(sumLosses) },
  ];
  const allDates = positions.map((p) => p.opened_at).sort();
  const period = allDates.length ? `${shortDate(allDates[0])} – ${shortDate(allDates[allDates.length - 1])}` : "—";
  // Human month range, e.g. "מרץ – מאי 2026", to caption KPI totals.
  const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  let periodMonths = "—";
  let currentMonthName = "—";
  let currentMonthKey = "";
  if (allDates.length) {
    const a = new Date(allDates[0]);
    const b = new Date(allDates[allDates.length - 1]);
    const am = `${HEB_MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    const bm = `${HEB_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    periodMonths = am === bm ? am : `${am} – ${bm}`;
    currentMonthName = bm;
    currentMonthKey = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}`;
  }
  // Current-month subset (latest month present in the data).
  const cmPositions = positions.filter((p) => {
    const d = new Date(p.opened_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonthKey;
  });
  const cmRealizedPositions = cmPositions.filter((p) => p.pnl_dollars != null);
  const cmTotalPnl = cmRealizedPositions.reduce((s, p) => s + (p.pnl_dollars ?? 0), 0);
  const cmTotalPnlPct = cmRealizedPositions.reduce((s, p) => s + (p.pnl_percent ?? 0), 0);
  const cmOpenUnrealized = cmPositions.reduce((s, p) => s + (p.unrealized_pnl_dollars ?? 0), 0);
  const cmOpenUnrealizedPct = cmPositions.reduce((s, p) => s + (p.unrealized_pnl_percent ?? 0), 0);
  const cmHasUnrealized = cmPositions.some((p) => p.unrealized_pnl_dollars != null);

  return (
    <EditModeProvider canEdit={canEdit}>
    <main className="mx-auto w-full max-w-[1320px] px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">יומן סימולציות לימודי — דיסקורד</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            <Link href="/" className="underline" style={{ color: "var(--accent)" }}>
              ← כל היומנים
            </Link>{" "}
            · רווח/הפסד ב-R ובאחוז מהתיק ·{" "}
            <Link href="/journal" className="underline" style={{ color: "var(--accent)" }}>
              סיגנלים גולמיים
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--muted)]">
            גודל תיק: <EditablePortfolioSize value={portfolioSize} />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
            תקופה: <strong className="text-[var(--text)]">{period}</strong> · סגורות: <strong className="text-[var(--text)]">{realized.length}</strong> · פתוחות: <strong className="text-[var(--accent)]">{openCount}</strong>
          </div>
        </div>
      </header>

      {channels.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {channels.map((c) => (
            <Link
              key={c.channel_id}
              href={`/positions?channel=${c.channel_id}`}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={
                c.channel_id === selected
                  ? { background: "var(--accent)", color: "#03131f", borderColor: "var(--accent)" }
                  : { borderColor: "var(--border)", color: "var(--muted)" }
              }
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <Disclaimer />

      <ProfitFactorHero profitFactor={profitFactor} grossWins={sumWins} grossLosses={sumLosses} closedCount={realized.length} winRate={winRate} wins={wins.length} losses={losses.length} />

      {/* Leverage selector — what-if scaling on per-trade risk size */}
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3">
        <div className="text-sm">
          <span className="font-bold text-[var(--text)]">מינוף "מה היה אם":</span>{" "}
          <span className="text-[var(--muted)]">מציג מה התשואה הייתה בסיכון כפול / משולש מהמוצע בעסקאות. R לא משתנה (מדד יחסי).</span>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((n) => (
            <Link
              key={n}
              href={`/positions?${new URLSearchParams({ ...(selected ? { channel: selected } : {}), ...(n === 1 ? {} : { lev: String(n) }) }).toString()}`}
              className="rounded-lg border px-3 py-1.5 text-sm font-bold transition"
              style={
                n === lev
                  ? { background: "var(--accent)", color: "#03131f", borderColor: "var(--accent)" }
                  : { color: "var(--muted)", borderColor: "var(--border)" }
              }
            >
              x{n}
            </Link>
          ))}
        </div>
      </section>

      {/* ביצועים — חודש נוכחי (קודם, כי זה הכי חשוב) */}
      {cmPositions.length > 0 && (
        <section className="mb-6">
          <div className="rounded-2xl border-2 p-5" style={{ borderColor: "rgba(34,197,94,0.55)", background: "linear-gradient(135deg, rgba(34,197,94,0.05), transparent)" }}>
            <h2 className="mb-4 text-lg font-extrabold" style={{ color: "var(--green)" }}>
              ביצועים — חודש נוכחי <span className="text-sm font-normal text-[var(--muted)]">· {currentMonthName} · {cmPositions.length} עסקאות</span>
            </h2>
            <div className="flex flex-col gap-4">
              {cmHasUnrealized && (
                <div className="grid grid-cols-1 gap-3">
                  <Kpi
                    label="סך הכל החודש (ממומש + פתוח)"
                    value={pct(cmTotalPnlPct + cmOpenUnrealizedPct)}
                    sub={`${money(cmTotalPnl + cmOpenUnrealized)} · ממומש ${money(cmTotalPnl)} + פתוח ${money(cmOpenUnrealized)}`}
                    color={pnlColor(cmTotalPnl + cmOpenUnrealized)}
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Kpi label="ממומש החודש" value={cmRealizedPositions.length ? pct(cmTotalPnlPct) : "—"} sub={cmRealizedPositions.length ? `${money(cmTotalPnl)} · ${cmRealizedPositions.length} סגורות` : "אין עסקאות סגורות החודש"} color={pnlColor(cmRealizedPositions.length ? cmTotalPnl : null)} />
                <Kpi label="פתוח החודש" value={cmHasUnrealized ? pct(cmOpenUnrealizedPct) : "—"} sub={cmHasUnrealized ? `${money(cmOpenUnrealized)} · לפי מחיר נוכחי` : "אין עסקאות פתוחות החודש"} color={pnlColor(cmHasUnrealized ? cmOpenUnrealized : null)} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mb-6 flex flex-col gap-4 lg:flex-row">
        {/* ימין — ביצועים (כל השאר) */}
        <div className="rounded-2xl border-2 p-5 lg:flex-[2]" style={{ borderColor: "rgba(148,163,184,0.35)" }}>
          <h2 className="mb-4 text-lg font-extrabold text-[var(--muted)]">
            ביצועים — סך התיק <span className="text-sm font-normal">· תקופה {periodMonths}</span>
          </h2>
          <div className="flex flex-col gap-4">
            {/* סך הכל (ממומש + פתוח) — מופיע רק כשיש פתוח, אחרת ה"ממומש" כבר מסכם הכל */}
            {hasUnrealized && (
              <div className="grid grid-cols-1 gap-3">
                <Kpi
                  label="סך הכל (ממומש + פתוח)"
                  value={pct(totalPnlPct + openUnrealizedPct)}
                  sub={`${money(totalPnl + openUnrealized)} · ממומש ${money(totalPnl)} + פתוח ${money(openUnrealized)} · תקופה ${periodMonths}`}
                  color={pnlColor(totalPnl + openUnrealized)}
                />
              </div>
            )}
            {/* זוג: רווח/הפסד ממומש ↔ פתוח */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="סך רווח/הפסד ממומש" value={realized.length ? pct(totalPnlPct) : "—"} sub={realized.length ? `${money(totalPnl)} · תקופה ${periodMonths}` : "מלא מחירי יציאה"} color={pnlColor(realized.length ? totalPnl : null)} />
              <Kpi label="רווח פתוח על השולחן" value={hasUnrealized ? pct(openUnrealizedPct) : "—"} sub={hasUnrealized ? `${money(openUnrealized)} · לפי מחיר נוכחי` : "רווח/הפסד פתוח · לפי מחיר נוכחי"} color={pnlColor(hasUnrealized ? openUnrealized : null)} />
            </div>
            {/* זוג: ממוצע עסקה מרוויחה ↔ מפסידה */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="ממוצע עסקה מרוויחה" value={wins.length ? money(avgWin) : "—"} sub={`סה״כ רווחים: ${money(sumWins)}`} color={wins.length ? "var(--green)" : undefined} />
              <Kpi label="ממוצע עסקה מפסידה" value={losses.length ? money(avgLoss) : "—"} sub={`סה״כ הפסדים: ${money(sumLosses)}`} color={losses.length ? "var(--red)" : undefined} />
            </div>
            {/* זוג: העסקה הטובה ↔ הגרועה ביותר */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="העסקה הטובה ביותר" value={best ? money(best.pnl_dollars) : "—"} sub={best ? `${best.asset}${r(best)}` : "—"} color={best ? "var(--green)" : undefined} />
              <Kpi label="העסקה הגרועה ביותר" value={worst ? money(worst.pnl_dollars) : "—"} sub={worst ? `${worst.asset}${r(worst)}` : "—"} color={worst ? "var(--red)" : undefined} />
            </div>
            {/* כסף שהושאר על הרצפה */}
            <div className="grid grid-cols-1 gap-3">
              <Kpi label="כסף שהושאר על הרצפה" value={totalLeftOnFloor > 0 ? money(totalLeftOnFloor) : "—"} sub="פער מהשיא (בעסקאות שמילאת מחיר שיא)" color="var(--gold)" />
            </div>
            {/* Risk-adjusted metrics: Sharpe + Sortino */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi
                label="מדד שארפ (Sharpe)"
                value={sharpe != null ? sharpe.toFixed(2) : "—"}
                sub="תשואה ÷ תנודתיות (לכל העסקאות) · גבוה יותר = טוב יותר"
                color={sharpe != null ? (sharpe >= 0 ? "var(--green)" : "var(--red)") : undefined}
              />
              <Kpi
                label="מדד סורטינו (Sortino)"
                value={sortino != null ? sortino.toFixed(2) : "—"}
                sub="תשואה ÷ תנודתיות שלילית (רק ירידות) · מודד יציבות בירידות"
                color={sortino != null ? (sortino >= 0 ? "var(--green)" : "var(--red)") : undefined}
              />
            </div>
            {/* פרשנות: מה אומרים שארפ/סורטינו של התיק לעומת SPX */}
            {sharpe != null && (
              <div className="rounded-xl border p-4 text-sm leading-relaxed" style={{ borderColor: "rgba(56,189,248,0.35)", background: "rgba(56,189,248,0.05)" }}>
                <div className="mb-2 text-xs font-bold text-[var(--muted)]">פרשנות מול S&P 500</div>
                <div className="text-[var(--text)]">
                  {(() => {
                    const portPct = totalPnlPct + (openUnrealizedPct ?? 0);
                    const sp = spxEndPct ?? 0;
                    const sharpVsSpx = spxSharpe != null && sharpe != null ? sharpe - spxSharpe : null;
                    const sortVsSpx = spxSortino != null && sortino != null ? sortino - spxSortino : null;
                    const portBetter = portPct > sp;
                    const verdict =
                      sharpVsSpx == null
                        ? "—"
                        : sharpVsSpx > 0.5
                        ? "טוב משמעותית מהמדד"
                        : sharpVsSpx > 0.1
                        ? "טוב מהמדד"
                        : sharpVsSpx > -0.1
                        ? "דומה למדד"
                        : "נמוך יותר מהמדד";
                    const sortinoGap = sortino != null && sharpe != null ? sortino - sharpe : null;
                    const stable =
                      sortinoGap == null
                        ? null
                        : sortinoGap > 0.5
                        ? "מאוד יציב בירידות (הסורטינו גבוה משמעותית מהשארפ — רוב התנודתיות במעלה, לא במורד)"
                        : sortinoGap > 0.1
                        ? "יציב יחסית בירידות (סורטינו גבוה מהשארפ)"
                        : sortinoGap > -0.1
                        ? "תנודתיות מאוזנת בין מעלה למטה"
                        : "תנודתיות גדולה בירידות";
                    return (
                      <>
                        <p>
                          התיק עשה <strong style={{ color: portBetter ? "var(--green)" : "var(--red)" }}>{pct(portPct)}</strong> · ה-SPX עשה <strong style={{ color: sp >= 0 ? "var(--green)" : "var(--red)" }}>{pct(sp)}</strong>{" "}
                          ({portBetter ? "התיק" : "SPX"} מקדים ב-{pct(Math.abs(portPct - sp))}).
                        </p>
                        <p className="mt-1">
                          מבחינת <strong>תשואה מתואמת סיכון</strong> (שארפ): התיק {sharpe.toFixed(2)} · SPX {spxSharpe != null ? spxSharpe.toFixed(2) : "—"}
                          {sharpVsSpx != null && (
                            <> — <strong style={{ color: sharpVsSpx > 0 ? "var(--green)" : "var(--red)" }}>{verdict}</strong></>
                          )}.
                        </p>
                        {stable && (
                          <p className="mt-1">
                            מבחינת <strong>יציבות בירידות</strong>: <strong style={{ color: sortinoGap! > 0.1 ? "var(--green)" : sortinoGap! < -0.1 ? "var(--red)" : "var(--muted)" }}>{stable}</strong>. הסורטינו של SPX באותה תקופה: {spxSortino != null ? spxSortino.toFixed(2) : "—"}.
                          </p>
                        )}
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          השורה התחתונה: {portBetter ? "התיק עקף את המדד גם בתשואה" : "המדד עשה תשואה גבוהה יותר"}, אבל המדד הקריטי הוא <strong>סורטינו</strong> — והוא {sortinoGap != null && sortinoGap > 0.1 ? "מראה שהתיק חוסך לסוחר את הירידות הגדולות שמלוות תיק מדד פסיבי" : "דומה בערך לתיק מדד פסיבי"}.
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* שמאל — פוטנציאל על העסקאות הפתוחות */}
        <div className="rounded-2xl border-2 p-4 lg:flex-1" style={{ borderColor: "rgba(56,189,248,0.4)" }}>
          <h3 className="mb-3 text-sm font-bold text-[var(--muted)]">פוטנציאל עסקאות פתוחות</h3>
          <div className="grid grid-cols-1 gap-3">
            <Kpi label="פוטנציאל רווח" value={`+${openPotential.toFixed(2)}%`} sub={`עד הטייק־פרופיט · ${openPotentialCount} עם יעד`} color="var(--green)" />
            <Kpi label="פוטנציאל הפסד" value={`-${openRisk.toFixed(2)}%`} sub={`אם ייפגעו הסטופים · ${openCount} פוזיציות`} color="var(--red)" />
          </div>
        </div>
      </section>

      <section className="mb-6">
        <PositionsCharts equity={equity} avgComparison={avgComparison} totals={totals} perTrade={perTrade} byAsset={byAsset} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">פירוט עסקאות <span className="text-xs font-normal text-[var(--muted)]">· לחץ על שורה לפתיחת הרגליים</span></h2>
        <PositionsTable positions={positions} channelId={selected ?? null} />
        <RecycleBin
          heading="סל מיחזור — שורות שנמחקו"
          items={deletedSignals.map((s) => ({
            id: s.id,
            title: `${s.asset ?? s.asset_raw ?? "—"}${s.direction ? ` · ${DIR_HE[s.direction]}` : ""} · ${ACTION_HE[s.action ?? "other"] ?? s.action}`,
            sub: `${shortDate(s.message.created_at)} · ${s.message.raw_content.replace(/\s+/g, " ").slice(0, 70)}`,
          }))}
          onRestore={restoreSignal}
        />
      </section>
    </main>
    </EditModeProvider>
  );
}
