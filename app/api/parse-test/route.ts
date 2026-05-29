import { NextRequest, NextResponse } from 'next/server';
import { parseTradeMessage, parseStockMessage } from '@/services/trade-parser-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Real stocks-channel messages (qualitative fractions, multi-ticker, descriptive
// stops) — used to validate the momentum_stocks parser without writing to the DB.
const STOCK_SAMPLES = [
  'SOXL פתחתי שליש כמות סטופ קצת מתחת לנמוך',
  'אם נסדק יעבור גבוה של רציף אוסיף עוד חלק SOXL',
  'נכנסתי שליש כמות FAS תעודה ממונפת על הסקטור הפיננסי, הסברתי בסשן\nפתחתי שליש כמות LAES דובר בסשן\nHYLN חזרתי לכמות קטנה',
  'HYLN סגרתי, פתחתי במקום\nBW\nשליש כמות',
  'Sofi הפחתתי חצי. יחסית קרוב לכניסה. בכל מקרה כמות קטנה נמתין לעוד אישורים',
  'Smh מימשתי חצי\nSoxl הכוונה. 2/3 מומש',
  'SOXL מימשתי גם את היתרה, עסקה 1 ל 15 על יחידת סיכון גדולה 🔥',
  'SIMO מומש עוד חלק\nSIMO בחוץ\nSMCI STOP לכניסה',
  'Apps כמות מלאה סטופ אזורי 7.15',
  'מתחת ל 220 soxl אממש עוד חלק',
  'מתחילים לייב עוד מספר דקות.\nשימו לב יש סיסמא :\n5482\n@everyone',
  'הרוב כבר עמוק בכסף במיוחד כמויות מלאות. מיקוד סופר חזק בסקטור השבבים.',
];

// Temporary route — validates the parser on real channel messages.
const SAMPLES = [
  'PLTR עסקה אחרונה יש לממש חצי',
  'PLTR לממש שליש מהעסקה האחרונה',
  'PLTR לסגור 50% מהפוזיציה',
  'PLTR יש להפחית רבע',
  'PLTR\nסיכון 0.2 אחוז מהתיק\nכניסה מיידית\nSTOP 134\nTP 200\n\nמחיר נוכחי 140',
  'זהב שורט , עוד הוספה. \n\nכניסה מיידית \n\nסיכון 0.2 אחוז מהתיק\n\nסטופ\n 4567\n\nטייק פרופיט \n4115',
  'הגענו לסיכון של 1 אחוז על התיק אך הוודאות גבוהה עקב התנהגות הנכס',
  'זהב יש לסגור עסקה אחרונה. נוסיף מחר עם וודאות',
  'זהב\n\nשימו לב עסקה זו מחליפה 2 עסקאות שנפתחו ונסגרו בבוקר. הטריגר כדי להגדיל וודאות בשבירה. \n\nXauusd \n \nטריגר לכניסה \n4495\n\nסיכון 0.3 אחוז מהתיק\n\nסטופ\n 4565\n\nטייק פרופיט \n4115',
  'זהב STOP על כל העסקה עובר ל 4526.\n\nשימו לב עסקה בסיכון של 1.5 אחוז לערך על התיק עוברת לסיכון מינורי של 0.3 אחוז מהתיק בערך.',
  'META\n\n\n\nסיכון 0.15 אחוז \n\nטריגר לכניסה \n616 \n\nSTOP\n595\n\nTP\n689',
  'META הוספה נוספת \n\nסיכון 0.2 אחוז \n\n\nSTOP\n610 \n\nTP\n689',
  'META\n\nיש להפחית חצי מהעסקה האחרונה של סיכון 0.2%.\n\nמחר נוסיף עם וודאות.',
  'META ביטול העסקה האחרונה, זו העסקה שבהמתנה:',
  'בוקר, אלו ימים סופר חשובים לתרחיש שלנו על הזהב. מזכיר שאנחנו ביחידת סיכון של סביב 1.3-1.5 אחוז על התיק נוסטרו, פוטנציאל בין 8 ל 11 אחוז.',
];

export async function GET(req: NextRequest) {
  const template = req.nextUrl.searchParams.get('template');
  const results = [];

  if (template === 'momentum_stocks') {
    for (const input of STOCK_SAMPLES) {
      try {
        const output = await parseStockMessage(input);
        results.push({ input, output });
      } catch (err) {
        results.push({ input, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return NextResponse.json({ template, count: results.length, results });
  }

  for (const input of SAMPLES) {
    try {
      const output = await parseTradeMessage(input);
      results.push({ input, output });
    } catch (err) {
      results.push({ input, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ count: results.length, results });
}
