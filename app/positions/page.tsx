import Link from "next/link";
import { getPositions } from "@/services/position-service";
import { getPortfolioSize } from "@/services/settings-service";
import { listChannels } from "@/services/channel-service";
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
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
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
            · יומן מניות — כמות/מחיר/עמלות · רווח/הפסד ב-$ ו-R
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

  const [positions, portfolioSize] = await Promise.all([getPositions(selected), getPortfolioSize()]);
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
  const equity: { label: string; value: number }[] = [];
  if (realized.length) equity.push({ label: "התחלה", value: 0 });
  let cum = 0;
  for (const p of [...realized].sort((a, b) => (a.closed_at ?? a.opened_at).localeCompare(b.closed_at ?? b.opened_at))) {
    cum += p.pnl_dollars ?? 0;
    equity.push({ label: `${p.asset} ${shortDate(p.closed_at ?? p.opened_at)}`, value: Math.round(cum) });
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

  return (
    <EditModeProvider canEdit={canEdit}>
    <main className="mx-auto w-full max-w-[1320px] px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">יומן מסחר — דיסקורד</h1>
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

      <section className="mb-6 flex flex-col gap-4 lg:flex-row">
        {/* ימין — ביצועים (כל השאר) */}
        <div className="rounded-2xl border-2 border-[var(--border)] p-4 lg:flex-[2]">
          <h3 className="mb-3 text-sm font-bold text-[var(--muted)]">ביצועים</h3>
          <div className="flex flex-col gap-4">
            {/* זוג: רווח/הפסד ממומש ↔ פתוח */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kpi label="סך רווח/הפסד ממומש" value={realized.length ? pct(totalPnlPct) : "—"} sub={realized.length ? money(totalPnl) : "מלא מחירי יציאה"} color={pnlColor(realized.length ? totalPnl : null)} />
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
        <PositionsTable positions={positions} />
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
