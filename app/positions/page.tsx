import Link from "next/link";
import { getPositions } from "@/services/position-service";
import { getPortfolioSize } from "@/services/settings-service";
import { EditablePortfolioSize } from "@/components/EditablePortfolioSize";
import { EditablePrice } from "@/components/EditablePrice";
import { ExcludeToggle } from "@/components/ExcludeToggle";
import { EditSignalButton } from "@/components/EditSignalButton";
import { EditableCurrentPrice } from "@/components/EditableCurrentPrice";
import type { Position, PositionLeg } from "@/types";

export const dynamic = "force-dynamic";

const DIRECTION_LABEL: Record<string, string> = {
  long: "לונג",
  short: "שורט",
  unknown: "—",
};
const LEG_LABEL: Record<string, string> = {
  entry: "כניסה",
  reduce: "הפחתה",
  close: "סגירה",
  cancel: "ביטול",
};
const ENTRY_LABEL: Record<string, string> = {
  immediate: "מיידית",
  trigger: "טריגר",
  limit: "לימיט",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function legDetail(leg: PositionLeg): string {
  if (leg.kind === "entry") {
    return leg.entry_type ? ENTRY_LABEL[leg.entry_type] ?? leg.entry_type : "כניסה";
  }
  return leg.quantity_text ?? LEG_LABEL[leg.kind];
}

function PositionCard({ p }: { p: Position }) {
  const dirColor = p.direction === "long" ? "var(--green)" : p.direction === "short" ? "var(--red)" : "var(--muted)";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-lg font-bold">{p.asset}</span>
        <span className="font-semibold" style={{ color: dirColor }}>
          {DIRECTION_LABEL[p.direction]}
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={
            p.status === "open"
              ? { background: "rgba(56,189,248,0.15)", color: "var(--accent)" }
              : { background: "rgba(148,163,184,0.15)", color: "var(--muted)" }
          }
        >
          {p.status === "open" ? "פתוחה" : "סגורה"}
        </span>
        {p.needs_review && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>
            לבדיקה
          </span>
        )}
        <span className="ms-auto text-xs text-[var(--muted)]">
          נפתחה {fmtDate(p.opened_at)}
          {p.closed_at ? ` · נסגרה ${fmtDate(p.closed_at)}` : ""}
        </span>
      </div>

      {p.status === "open" && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
          <span className="text-[var(--muted)]">מחיר נוכחי:</span>
          <EditableCurrentPrice asset={p.asset} value={p.current_price} />
          <span className="text-[var(--border)]">|</span>
          <span className="text-[var(--muted)]">רווח פתוח על השולחן:</span>
          <span className="font-semibold tabular-nums" style={{ color: pnlColor(p.unrealized_pnl_dollars) }}>
            {p.unrealized_pnl_dollars != null
              ? `${fmtMoney(p.unrealized_pnl_dollars)} · ${fmtPct(p.unrealized_pnl_percent)} · ${p.unrealized_r != null ? p.unrealized_r.toFixed(2) + "R" : "—"}`
              : "הזן מחיר נוכחי כדי לחשב"}
          </span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="ממוצע כניסה" value={p.avg_entry_price != null ? p.avg_entry_price.toFixed(2) : "—"} />
        <Stat label="ממוצע יציאה" value={p.avg_exit_price != null ? p.avg_exit_price.toFixed(2) : "—"} />
        <Stat label="R שהושג" value={p.r_achieved != null ? `${p.r_achieved.toFixed(2)}R` : "—"} color={pnlColor(p.pnl_dollars)} />
        <Stat
          label="רווח/הפסד"
          value={p.pnl_dollars != null ? `${fmtMoney(p.pnl_dollars)} · ${fmtPct(p.pnl_percent)}` : "—"}
          color={pnlColor(p.pnl_dollars)}
        />
        <Stat label="סיכון כולל" value={`${p.total_risk_percent.toFixed(2)}%`} />
        <Stat label="סטופ נוכחי" value={p.current_stop != null ? String(p.current_stop) : "—"} />
      </div>

      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="border-b border-[var(--border)] px-2 py-2 text-right text-xs text-[var(--muted)]">תאריך</th>
            <th className="border-b border-[var(--border)] px-2 py-2 text-right text-xs text-[var(--muted)]">סוג</th>
            <th className="border-b border-[var(--border)] px-2 py-2 text-right text-xs text-[var(--muted)]">פרט</th>
            <th className="border-b border-[var(--border)] px-2 py-2 text-right text-xs text-[var(--muted)]">מחיר</th>
            <th className="border-b border-[var(--border)] px-2 py-2 text-right text-xs text-[var(--muted)]">סיכון</th>
            <th className="border-b border-[var(--border)] px-2 py-2 text-right text-xs text-[var(--muted)]"></th>
          </tr>
        </thead>
        <tbody>
          {p.legs.map((leg) => {
            const struck = leg.excluded
              ? { textDecoration: "line-through" as const, opacity: 0.45 }
              : undefined;
            return (
            <tr key={leg.signal_id}>
              <td className="border-b border-[var(--border)] px-2 py-2 text-[var(--muted)] tabular-nums whitespace-nowrap" style={struck}>{fmtDate(leg.date)}</td>
              <td className="border-b border-[var(--border)] px-2 py-2" style={struck}>{LEG_LABEL[leg.kind]}</td>
              <td className="border-b border-[var(--border)] px-2 py-2" style={struck}>{legDetail(leg)}</td>
              <td className="border-b border-[var(--border)] px-1 py-1" style={struck}>
                {leg.kind === "cancel" ? (
                  <span className="px-2 text-[var(--muted)]">—</span>
                ) : (
                  <EditablePrice signalId={leg.signal_id} kind={leg.kind} value={leg.price} />
                )}
              </td>
              <td className="border-b border-[var(--border)] px-2 py-2 tabular-nums" style={struck}>{leg.risk_percent != null ? `${leg.risk_percent}%` : "—"}</td>
              <td className="border-b border-[var(--border)] px-1 py-1 text-left whitespace-nowrap">
                {leg.discord_url && (
                  <a
                    href={leg.discord_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded px-2 py-1 text-xs hover:bg-[rgba(56,189,248,0.12)]"
                    style={{ color: "var(--accent)" }}
                    title="פתח את ההודעה בדיסקורד"
                  >
                    ↗ דיסקורד
                  </a>
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

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function pnlColor(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? "var(--green)" : "var(--red)";
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export default async function PositionsPage() {
  const [positions, portfolioSize] = await Promise.all([getPositions(), getPortfolioSize()]);
  const openCount = positions.filter((p) => p.status === "open").length;

  const realized = positions.filter((p) => p.pnl_dollars != null);
  const totalPnl = realized.reduce((s, p) => s + (p.pnl_dollars ?? 0), 0);
  const totalPnlPct = realized.reduce((s, p) => s + (p.pnl_percent ?? 0), 0);
  const wins = realized.filter((p) => (p.pnl_dollars ?? 0) > 0).length;
  const losses = realized.filter((p) => (p.pnl_dollars ?? 0) < 0).length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null;
  const rValues = realized.map((p) => p.r_achieved).filter((r): r is number => r != null);
  const avgR = rValues.length ? rValues.reduce((s, r) => s + r, 0) / rValues.length : null;
  const openPositions = positions.filter((p) => p.status === "open");
  const openRisk = openPositions.reduce((s, p) => s + p.total_risk_percent, 0);
  const openUnrealized = openPositions.reduce((s, p) => s + (p.unrealized_pnl_dollars ?? 0), 0);
  const hasUnrealized = openPositions.some((p) => p.unrealized_pnl_dollars != null);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">יומן מסחר — פוזיציות</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            סיגנלים מקובצים לעסקאות לפי נכס + כיוון ·{" "}
            <Link href="/journal" className="underline" style={{ color: "var(--accent)" }}>
              לתצוגת הסיגנלים הגולמיים
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--muted)]">
            גודל תיק: <EditablePortfolioSize value={portfolioSize} />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
            {positions.length} עסקאות · <strong className="text-[var(--accent)]">{openCount}</strong> פתוחות
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi
          label="סך רווח/הפסד ממומש"
          value={realized.length ? fmtMoney(totalPnl) : "—"}
          sub={realized.length ? `${fmtPct(totalPnlPct)} מהתיק · על תיק $${portfolioSize.toLocaleString("en-US")}` : "מלא מחירי יציאה כדי לחשב"}
          color={pnlColor(realized.length ? totalPnl : null)}
        />
        <Kpi
          label="רווח פתוח על השולחן"
          value={hasUnrealized ? fmtMoney(openUnrealized) : "—"}
          sub={hasUnrealized ? "לא ממומש · לפי מחיר נוכחי" : "הזן מחיר נוכחי בפוזיציות"}
          color={pnlColor(hasUnrealized ? openUnrealized : null)}
        />
        <Kpi
          label="אחוז הצלחה"
          value={winRate != null ? `${winRate.toFixed(0)}%` : "—"}
          sub={`${wins} רווח · ${losses} הפסד`}
        />
        <Kpi label="ממוצע R" value={avgR != null ? `${avgR.toFixed(2)}R` : "—"} sub="על עסקאות שמומשו" />
        <Kpi
          label="סיכון פתוח"
          value={`${openRisk.toFixed(2)}%`}
          sub={`${openCount} פוזיציות פתוחות`}
          color="var(--gold)"
        />
      </section>

      {positions.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">
          עדיין אין פוזיציות. סיגנלים שייכנסו יקובצו לכאן אוטומטית.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {positions.map((p) => (
            <PositionCard key={p.key + p.opened_at} p={p} />
          ))}
        </div>
      )}
    </main>
  );
}
