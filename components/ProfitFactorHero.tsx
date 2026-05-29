// Prominent headline metric: profit factor = total $ won ÷ total $ lost.
// It neutralizes win rate — you can win only 10% of trades and still be very
// profitable if the wins dwarf the losses. Shown big, in its own row.
function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function ProfitFactorHero({
  profitFactor,
  grossWins,
  grossLosses,
  closedCount,
}: {
  profitFactor: number | null;
  grossWins: number;
  grossLosses: number; // stored as a negative sum
  closedCount: number;
}) {
  const hasClosed = closedCount > 0;
  const display = profitFactor != null ? profitFactor.toFixed(2) : hasClosed && grossWins > 0 ? "∞" : "—";
  const color = !hasClosed
    ? "var(--muted)"
    : profitFactor == null || profitFactor >= 1
      ? "#22c55e"
      : "#ef4444";
  return (
    <section className="mb-6">
      <div
        className="flex flex-col gap-4 rounded-2xl border-2 p-5 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: color, background: "var(--panel)" }}
      >
        <div className="max-w-2xl">
          <div className="text-base font-bold">מכפיל רווח/הפסד</div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            כמה דולר הרווחת על כל דולר שהפסדת (סך כל הרווחים ÷ סך כל ההפסדים). זה המדד המשמעותי באמת —
            הוא מנטרל את אחוז ההצלחה: אפשר לנצח רק ב-10% מהעסקאות ועדיין להיות רווחי מאוד אם הרווחים
            גדולים מההפסדים, וגם להפך. ערך מעל 1 = רווחי; ככל שגבוה יותר, כל דולר בסיכון מחזיר יותר.
          </p>
        </div>
        <div className="shrink-0 text-center sm:text-left">
          <div className="text-6xl font-extrabold leading-none tabular-nums" style={{ color }}>{display}</div>
          <div className="mt-2 text-xs text-[var(--muted)]">
            {hasClosed ? `${money(grossWins)} רווחים · ${money(Math.abs(grossLosses))} הפסדים` : "אין עדיין עסקאות סגורות"}
          </div>
        </div>
      </div>
    </section>
  );
}
