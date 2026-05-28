import Link from "next/link";
import { listChannels } from "@/services/channel-service";
import { getPositions } from "@/services/position-service";

export const dynamic = "force-dynamic";

const TEMPLATE_LABEL: Record<string, string> = {
  portfolio_risk: "סיכון מהתיק · R",
  momentum_stocks: "מניות · דולרים / כמות",
};

function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function Home() {
  const channels = await listChannels();
  const summaries = await Promise.all(
    channels.map(async (c) => {
      const positions = await getPositions(c.channel_id);
      const open = positions.filter((p) => p.status === "open").length;
      const realizedPnl = positions.reduce((s, p) => s + (p.pnl_dollars ?? 0), 0);
      const hasRealized = positions.some((p) => p.pnl_dollars != null);
      return { channel: c, total: positions.length, open, realizedPnl, hasRealized };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold">יומני מסחר — דיסקורד לייב</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">בחר ערוץ כדי לפתוח את היומן והתיעוד מהדיסקורד</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {summaries.map(({ channel: c, total, open, realizedPnl, hasRealized }) => (
          <Link
            key={c.channel_id}
            href={`/positions?channel=${c.channel_id}`}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:border-[var(--accent)]"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-lg font-bold">{c.name}</span>
              <span className="rounded-full bg-[var(--panel-2)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
                {TEMPLATE_LABEL[c.template] ?? c.template}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
              <span>{total} עסקאות</span>
              <span>· <strong className="text-[var(--accent)]">{open}</strong> פתוחות</span>
              {hasRealized && (
                <span>
                  · רווח ממומש{" "}
                  <strong style={{ color: realizedPnl >= 0 ? "var(--green)" : "var(--red)" }}>{money(realizedPnl)}</strong>
                </span>
              )}
            </div>
            <div className="mt-4 text-sm font-medium" style={{ color: "var(--accent)" }}>
              פתח יומן ←
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
