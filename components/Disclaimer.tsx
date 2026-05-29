// Shared educational/simulations disclaimer — shown on the home screen and every journal.
export function Disclaimer() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-base leading-relaxed" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.05))", borderColor: "rgba(245,158,11,0.35)", color: "#fde68a" }}>
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-base font-extrabold" style={{ background: "rgba(245,158,11,0.25)", color: "var(--gold)" }}>!</span>
      <div>
        <strong style={{ color: "#fcd34d" }}>אזהרה — יומן לימודי, סימולציות בלבד ללא כסף אמיתי.</strong>{" "}
        יומן המסחר הינו לימודי ומורכב מסימולציות בלבד, ללא מסחר בכסף אמיתי — כסף מדומה ולא אמיתי, למטרות לימודיות, בידוריות והעשרה בלבד. אין באמור משום ייעוץ או שיווק השקעות, המלצה לרכישה או מכירה של נייר ערך, או תחליף לייעוץ המתחשב בנתונים ובצרכים של כל אדם. ביצועי עבר אינם מעידים על ביצועים עתידיים. כל פעולה שתיעשה על בסיס המידע כאן היא באחריות המשתמש בלבד.
      </div>
    </div>
  );
}
