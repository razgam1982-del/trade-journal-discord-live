import Link from "next/link";
import { getPositions } from "@/services/position-service";
import { getPortfolioSize } from "@/services/settings-service";
import { EditablePortfolioSize } from "@/components/EditablePortfolioSize";
import { PositionsCharts } from "@/components/PositionsCharts";
import { PositionsTable } from "@/components/PositionsTable";

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

export default async function PositionsPage() {
  const [positions, portfolioSize] = await Promise.all([getPositions(), getPortfolioSize()]);

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
  const payoff = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
  const profitFactor = sumLosses !== 0 ? sumWins / Math.abs(sumLosses) : null;
  let best: (typeof realized)[number] | null = null;
  let worst: (typeof realized)[number] | null = null;
  for (const p of realized) {
    if (!best || (p.pnl_dollars ?? 0) > (best.pnl_dollars ?? 0)) best = p;
    if (!worst || (p.pnl_dollars ?? 0) < (worst.pnl_dollars ?? 0)) worst = p;
  }
  const openRisk = openPositions.reduce((s, p) => s + p.total_risk_percent, 0);
  const openUnrealized = openPositions.reduce((s, p) => s + (p.unrealized_pnl_dollars ?? 0), 0);
  const hasUnrealized = openPositions.some((p) => p.unrealized_pnl_dollars != null);
  const r = (p: { r_achieved: number | null } | null) => (p?.r_achieved != null ? ` · ${p.r_achieved.toFixed(2)}R` : "");

  // Chart data. Effective P/L = realized if closed, else unrealized.
  const eff = (p: (typeof positions)[number]) => p.pnl_dollars ?? p.unrealized_pnl_dollars ?? null;
  const equity: { label: string; value: number }[] = [];
  let cum = 0;
  for (const p of [...realized].sort((a, b) => (a.closed_at ?? a.opened_at).localeCompare(b.closed_at ?? b.opened_at))) {
    cum += p.pnl_dollars ?? 0;
    equity.push({ label: `${p.asset} ${shortDate(p.closed_at ?? p.opened_at)}`, value: Math.round(cum) });
  }
  const perTrade = positions
    .filter((p) => eff(p) != null)
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
    <main className="mx-auto w-full max-w-[1320px] px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">יומן מסחר — דיסקורד לייב</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            עסקאות מסונכרנות מהדיסקורד · רווח/הפסד ב-R ובאחוז מהתיק ·{" "}
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

      <div className="mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.05))", borderColor: "rgba(245,158,11,0.35)", color: "#fde68a" }}>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-base font-extrabold" style={{ background: "rgba(245,158,11,0.25)", color: "var(--gold)" }}>!</span>
        <div>
          <strong style={{ color: "#fcd34d" }}>אזהרה — יומן לימודי, לא המלצת השקעה.</strong>{" "}
          העסקאות המוצגות הן תיעוד אישי של פעילות מסחר ואינן מהוות ייעוץ או שיווק השקעות, המלצה לרכישה או מכירה של נייר ערך, או תחליף לייעוץ המתחשב בנתונים ובצרכים של כל אדם. ביצועי עבר אינם מעידים על ביצועים עתידיים. מסחר בשוק ההון כרוך בסיכון משמעותי לרבות אובדן הקרן. כל פעולה שתיעשה על בסיס המידע כאן היא באחריות המשתמש בלבד.
        </div>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Kpi label="סך רווח/הפסד ממומש" value={realized.length ? money(totalPnl) : "—"} sub={realized.length ? `ממוצע לעסקה: ${money(avgPnl)} · ${pct(totalPnlPct)}` : "מלא מחירי יציאה"} color={pnlColor(realized.length ? totalPnl : null)} />
        <Kpi label="רווח פתוח על השולחן" value={hasUnrealized ? money(openUnrealized) : "—"} sub="לא ממומש · לפי מחיר נוכחי" color={pnlColor(hasUnrealized ? openUnrealized : null)} />
        <Kpi label="אחוז הצלחה" value={winRate != null ? `${winRate.toFixed(0)}%` : "—"} sub={`${wins.length} רווח · ${losses.length} הפסד`} color="var(--accent)" />
        <Kpi label="ממוצע עסקה מרוויחה" value={wins.length ? money(avgWin) : "—"} sub={`סה״כ רווחים: ${money(sumWins)}`} color={wins.length ? "var(--green)" : undefined} />
        <Kpi label="ממוצע עסקה מפסידה" value={losses.length ? money(avgLoss) : "—"} sub={`סה״כ הפסדים: ${money(sumLosses)}`} color={losses.length ? "var(--red)" : undefined} />
        <Kpi label="מכפיל רווח/הפסד" value={payoff != null ? `${payoff.toFixed(2)}x` : "—"} sub="ממוצע רווח ÷ |ממוצע הפסד|" color="var(--accent)" />
        <Kpi label="פקטור רווח" value={profitFactor != null ? profitFactor.toFixed(2) : "—"} sub="סך רווחים ÷ סך הפסדים" color="var(--gold)" />
        <Kpi label="העסקה הטובה ביותר" value={best ? money(best.pnl_dollars) : "—"} sub={best ? `${best.asset}${r(best)}` : "—"} color={best ? "var(--green)" : undefined} />
        <Kpi label="העסקה הגרועה ביותר" value={worst ? money(worst.pnl_dollars) : "—"} sub={worst ? `${worst.asset}${r(worst)}` : "—"} color={worst ? "var(--red)" : undefined} />
        <Kpi label="סיכון פתוח" value={`${openRisk.toFixed(2)}%`} sub={`${openCount} פוזיציות פתוחות`} color="var(--gold)" />
      </section>

      <section className="mb-6">
        <PositionsCharts equity={equity} avgComparison={avgComparison} totals={totals} perTrade={perTrade} byAsset={byAsset} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">פירוט עסקאות <span className="text-xs font-normal text-[var(--muted)]">· לחץ על שורה לפתיחת הרגליים</span></h2>
        <PositionsTable positions={positions} />
      </section>
    </main>
  );
}
