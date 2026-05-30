// Login screen. Shown to anyone without a valid viewer session.
// The owner (EDIT_SECRET cookie holder) never reaches this page.

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, { title: string; body: string; cta: boolean }> = {
  no_role: {
    title: 'אין לך גישה ליומן',
    body: 'הזיהוי שלך עבר, אבל אין לך תפקיד פעיל בקהילה. אם הצטרפת לאחרונה לקהילה, נסה לרענן בעוד דקה. אם פג התוקף או יש בעיה אחרת, פנה לרז.',
    cta: true,
  },
  auth: {
    title: 'שגיאת אימות',
    body: 'משהו השתבש בתהליך ההתחברות מול Discord. נסה שוב.',
    cta: false,
  },
  state: {
    title: 'בקשה לא תקפה',
    body: 'נראה שהקישור פג תוקף. לחץ "התחבר עם Discord" כדי להתחיל שוב.',
    cta: false,
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; err?: string }>;
}) {
  const { next, err } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const authUrl = `/api/auth/discord?next=${encodeURIComponent(safeNext)}`;
  const errInfo = err ? ERROR_MESSAGES[err] : null;
  const communityUrl = process.env.COMMUNITY_JOIN_URL || '#';

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0e1a' }}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-7" style={{ color: '#e6ecf5' }}>
        <h1 className="text-2xl font-extrabold text-center mb-2">יומן סימולציות לימודי</h1>
        <p className="text-sm text-center text-[var(--muted)] mb-6">
          מדמה תיק נוסטרו של $100,000 · סימולציות בלבד ללא כסף אמיתי
        </p>

        {errInfo ? (
          <div className="mb-5 rounded-xl border p-4" style={{ background: errInfo.cta ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)', borderColor: errInfo.cta ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)' }}>
            <div className="font-bold mb-1" style={{ color: errInfo.cta ? '#fcd34d' : '#fca5a5' }}>{errInfo.title}</div>
            <div className="text-sm leading-relaxed" style={{ color: errInfo.cta ? '#fde68a' : '#fecaca' }}>{errInfo.body}</div>
            {errInfo.cta && (
              <a
                href={communityUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
                style={{ background: 'rgba(245,158,11,0.25)', color: '#fde047' }}
              >
                להצטרפות לקהילה ←
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] mb-6 leading-relaxed text-center">
            הגישה ליומן מותנית בחברות פעילה בקהילת המסחר.
            התחבר עם חשבון ה-Discord שלך כדי שנוכל לוודא.
          </p>
        )}

        <a
          href={authUrl}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-bold transition hover:brightness-110"
          style={{ background: '#5865F2', color: 'white' }}
        >
          <span aria-hidden style={{ fontSize: 18 }}>◇</span>
          התחבר עם Discord
        </a>

        <p className="mt-6 text-xs text-center text-[var(--muted)] leading-relaxed">
          תצוגה בדיליי של 12 שעות. אין באמור משום ייעוץ או שיווק השקעות.
          ביצועי עבר אינם מעידים על ביצועים עתידיים.
        </p>
      </div>
    </main>
  );
}
