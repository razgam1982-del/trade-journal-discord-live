// Shared educational/simulations disclaimer — shown on the home screen and every journal.
export function Disclaimer() {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border px-5 py-4 text-base leading-relaxed" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.06))", borderColor: "rgba(245,158,11,0.45)", color: "#fde68a" }}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-lg font-extrabold" style={{ background: "rgba(245,158,11,0.3)", color: "var(--gold)" }}>!</span>
        <div className="text-xl font-extrabold tracking-tight" style={{ color: "#fde047" }}>
          יומן המסחר הלימודי מדמה תיק נוסטרו של $100,000
        </div>
      </div>
      <div className="ps-11 text-sm font-semibold" style={{ color: "#fcd34d" }}>
        אין לפעול בסיכון של הון עצמי.
      </div>
      <div className="ps-11 text-sm">
        <strong style={{ color: "#fcd34d" }}>סימולציות בלבד ללא כסף אמיתי.</strong>{" "}
        היומן הינו לימודי ומורכב מסימולציות בלבד, ללא מסחר בכסף אמיתי — כסף מדומה, למטרות לימודיות, בידוריות והעשרה בלבד. אין באמור משום ייעוץ או שיווק השקעות, המלצה לרכישה או מכירה של נייר ערך, או תחליף לייעוץ המתחשב בנתונים ובצרכים של כל אדם. ביצועי עבר אינם מעידים על ביצועים עתידיים. כל פעולה שתיעשה על בסיס המידע כאן היא באחריות המשתמש בלבד.
      </div>
    </div>
  );
}
