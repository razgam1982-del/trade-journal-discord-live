import Link from "next/link";
import { listTradeSignals } from "@/services/trade-signal-service";
import type { TradeSignalWithMessage } from "@/types";

export const dynamic = "force-dynamic";

const DIRECTION_LABEL: Record<string, string> = { long: "לונג", short: "שורט" };
const ACTION_LABEL: Record<string, string> = {
  entry: "כניסה",
  add: "הוספה",
  reduce: "הפחתה",
  close: "סגירה",
  stop_update: "עדכון סטופ",
  cancel: "ביטול",
  other: "אחר",
};
const ENTRY_LABEL: Record<string, string> = {
  immediate: "מיידית",
  trigger: "טריגר",
  limit: "לימיט",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(n: number | null): string {
  return n == null ? "—" : String(n);
}

function entryCell(s: TradeSignalWithMessage): string {
  if (!s.entry_type) return "—";
  const label = ENTRY_LABEL[s.entry_type] ?? s.entry_type;
  return s.entry_price != null ? `${label} ${s.entry_price}` : label;
}

const TH =
  "sticky top-0 border-b border-[var(--border)] bg-[var(--panel-2)] px-3 py-3 text-right text-xs font-semibold text-[var(--muted)] whitespace-nowrap";
const TD = "border-b border-[var(--border)] px-3 py-3 whitespace-nowrap";

export default async function JournalPage() {
  const signals = await listTradeSignals(200);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">יומן סימולציות לימודי — עסקאות מהדיסקורד</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            כל סיגנל שנכתב בערוץ מפורק אוטומטית ומופיע כאן ·{" "}
            <Link href="/positions" className="underline" style={{ color: "var(--accent)" }}>
              לתצוגת הפוזיציות (היומן)
            </Link>
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
          סך עסקאות: <strong className="text-[var(--text)]">{signals.length}</strong>
        </div>
      </header>

      {signals.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">
          עדיין אין עסקאות. כתוב סיגנל בערוץ המנוטר והוא יופיע כאן תוך שניות.
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={TH}>זמן</th>
                <th className={TH}>נכס</th>
                <th className={TH}>כיוון</th>
                <th className={TH}>פעולה</th>
                <th className={TH}>כניסה</th>
                <th className={TH}>סיכון</th>
                <th className={TH}>סטופ</th>
                <th className={TH}>טייק</th>
                <th className={TH}>טקסט מקורי</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.id} className="hover:bg-[rgba(56,189,248,0.04)]">
                  <td className={`${TD} text-[var(--muted)] tabular-nums`}>
                    {fmtTime(s.message.created_at)}
                  </td>
                  <td className={`${TD} font-semibold`}>
                    {s.asset ?? s.asset_raw ?? "—"}
                    {s.needs_review && (
                      <span className="mr-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)" }}>
                        לבדיקה
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {s.direction ? (
                      <span style={{ color: s.direction === "long" ? "var(--green)" : "var(--red)" }}>
                        {DIRECTION_LABEL[s.direction]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={TD}>{s.action ? ACTION_LABEL[s.action] ?? s.action : "—"}</td>
                  <td className={TD}>{entryCell(s)}</td>
                  <td className={`${TD} tabular-nums`}>
                    {s.risk_percent != null ? `${s.risk_percent}%` : "—"}
                  </td>
                  <td className={`${TD} tabular-nums`}>{num(s.stop_price)}</td>
                  <td className={`${TD} tabular-nums`}>{num(s.tp_price)}</td>
                  <td
                    className="border-b border-[var(--border)] px-3 py-3 max-w-xs truncate text-[var(--muted)]"
                    title={s.message.raw_content}
                  >
                    {s.message.raw_content.replace(/\n+/g, " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
