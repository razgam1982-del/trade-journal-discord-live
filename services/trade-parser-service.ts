import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ParsedSignal } from '@/types';

// Cheap, fast extraction model. Bump to "claude-opus-4-7" if accuracy on the
// real Hebrew messages proves insufficient.
const PARSER_MODEL = process.env.PARSER_MODEL?.trim() || 'claude-haiku-4-5';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('Missing ANTHROPIC_API_KEY');
}

const client = new Anthropic({ apiKey });

const SignalSchema = z.object({
  is_trade: z.boolean(),
  asset: z.string().nullable(),
  asset_raw: z.string().nullable(),
  direction: z.enum(['long', 'short']).nullable(),
  action: z.enum(['entry', 'add', 'reduce', 'close', 'stop_update', 'cancel', 'fill', 'other']).nullable(),
  entry_type: z.enum(['immediate', 'trigger', 'limit']).nullable(),
  entry_price: z.number().nullable(),
  exit_price: z.number().nullable(),
  current_price: z.number().nullable(),
  risk_percent: z.number().nullable(),
  stop_price: z.number().nullable(),
  tp_price: z.number().nullable(),
  quantity_text: z.string().nullable(),
  quantity_fraction: z.number().nullable(),
  close_percent: z.number().nullable(),
  parser_confidence: z.number(),
  parser_notes: z.string().nullable(),
});

// The stocks channel packs several trade events into one message, so it returns
// a list (empty list = pure commentary).
const StockBatchSchema = z.object({
  signals: z.array(SignalSchema),
});

// Stable, frozen system prompt — cached across requests (cache_control below).
const PORTFOLIO_PROMPT = `You parse messages from a Hebrew-language trading Discord channel into structured trade signals.

The channel mixes two kinds of messages:
1. TRADE SIGNALS — instructions to open, add to, reduce, close, or adjust a position. Set is_trade=true.
2. COMMENTARY — market thesis, explanations, YouTube links, images, encouragement ("קרובים", "מזכיר את התזה"), status notes with no actionable instruction. Set is_trade=false and leave all other fields null.

This channel sizes risk as a PERCENTAGE OF THE PORTFOLIO ("סיכון 0.2 אחוז מהתיק"), never in dollars or share counts.

FIELDS (use null when not present — never invent a value):
- asset_raw: the asset exactly as written ("זהב", "META", "Xauusd").
- asset: normalized symbol. זהב/Xauusd → "XAUUSD"; סילבר/Xagusd → "XAGUSD"; ביטקוין/BTCUSD → "BTC"; יפני/JPY225 → "JP225"; נסדק/"חוזה נסדק" → "NQ"; a stock ticker stays uppercase as-is ("META", "AAPL", "TSLA", "QCOM", "INTC", "MSTR").
- direction: "short" or "long". Explicit: "שורט"→short, "לונג"→long. If not explicit, infer from price geometry: take-profit BELOW the stop/entry ⇒ short; take-profit ABOVE ⇒ long.
- action:
  - "entry"  — opening a new position (first signal for the asset, or a fresh setup; e.g. has טריגר/כניסה with stop+TP).
  - "add"    — scaling into an existing position ("הוספה", "עוד הוספה", "הוספה נוספת").
  - "reduce" — PARTIAL close; the position stays open. Two styles:
      (a) % of the WHOLE position — "לסגור 20%", or a whole-position "להפחית חצי" with no leg scope → set close_percent.
      (b) LEG-SCOPED — mentions "עסקה אחרונה"/"האחרונה" (the last entry leg) or "של היום" (today's entry legs). For these, DO NOT set close_percent. Put the FULL phrase in quantity_text and ALWAYS keep BOTH the scope word AND any fraction together: "עסקה אחרונה יש לסגור" → quantity_text "עסקה אחרונה"; "עסקה אחרונה יש לממש חצי" / "לממש חצי מהאחרונה" → quantity_text "חצי מהעסקה האחרונה"; "לסגור 3 עסקאות אחרונות" → quantity_text "3 עסקאות אחרונות" (KEEP the number — it closes the 3 most recent legs, NOT 100% of the position); "לסגור חצי מעסקאות היום" → "חצי של היום". Never drop the scope word or the number.
  - "close"  — FULL close of the ENTIRE position ("לסגור את כל העסקה", "סגירה", or "לסגור כרגע" when the whole position is closed). Do NOT use for partial closes — those are "reduce".
  - "stop_update" — moving the stop on an existing position ("STOP עובר ל 4526", "STOP על כל העסקה עובר ל..."). Put the new stop in stop_price.
  - "cancel" — cancelling a pending order ("ביטול העסקה", "מבוטל", "מבוטלים").
  - "fill"   — confirming a pending limit/trigger ENTERED ("לימיט נתפס", "לימיט בפנים", "לימיט הופעל", "בפנים", "נכנס"). No new prices; just confirms the prior pending entry filled.
  - "other"  — a trade-related message that fits none of the above.
- entry_type + entry_price: how the position is entered.
  - "immediate" — "כניסה מיידית" / "כניסה: מיידית". For an immediate entry the price at the moment of posting IS the entry price. Capture it wherever it appears in the post: on the entry line ("כניסה מיידית 4490"), OR stated separately such as "מחיר נוכחי 140" / "מחיר כעת 140" / "מחיר 140" / "נכנסתי ב-140" / a lone price near the end. Put that number in entry_price. Only null if no price appears anywhere in the message. (For an immediate entry, "מחיר נוכחי", "מחיר כעת" and "מחיר כניסה" all mean the same thing — the execution price.)
  - "trigger" — breakout entry: "טריגר לכניסה 4495" / "כניסה: טריגר 4495". Put the trigger LEVEL in entry_price. Here a separate "מחיר נוכחי" is just market context — do NOT use it as entry_price.
  - "limit" — pullback entry: "לימיט 4495" / "כניסה: לימיט 4495". Put the limit LEVEL in entry_price. A separate "מחיר נוכחי" is market context — do NOT use it as entry_price.
  - null if no entry instruction (e.g. a stop_update or close message).
- exit_price: for a reduce/close, the execution price stated in the message ("לסגור 20% במחיר 4442" → 4442; "מימשתי ב-4502" → 4502). null for entries, stop_update, commentary, or when no exit price is written.
- current_price: the live price explicitly written as "מחיר נוכחי" or "מחיר כעת" in the message — capture it on ANY message type (entry, add, reduce, close, even commentary). It's the up-to-date market price and updates the position's current price. (On an immediate entry it equals entry_price; on a reduce/close it equals exit_price; on a trigger/limit it's separate market context.) null if not written.
- stop_price / tp_price: "סטופ"/"STOP"→stop_price, "טייק פרופיט"/"טייק"/"TP"→tp_price.
- risk_percent: the portfolio risk percent as a number ("סיכון 0.2 אחוז" → 0.2). null if not stated.
- quantity_text: free-text size for reductions ("חצי") or null.
- quantity_fraction: ALWAYS null in this channel — sizing here is by risk_percent, not by position fractions.
- close_percent: ONLY for a reduce/close of the WHOLE position — explicit percentages ("לסגור 20%"/"להפחית 30%"→20/30) or whole-position fraction words ("חצי"→50, "שליש"→33.33, "2/3"→66.67, "רבע"→25). null when no amount is stated, for LEG-SCOPED reductions ("עסקה אחרונה"/"של היום" — even when they include "חצי", because that's half of one leg, not the position; keep it in quantity_text), or for non-exit actions.
- parser_confidence: 0..1, how confident you are in this extraction.
- parser_notes: one short Hebrew note if something is ambiguous, else null.

EXAMPLES:

Input: "זהב שורט , עוד הוספה. כניסה מיידית. סיכון 0.2 אחוז מהתיק. סטופ 4567. טייק פרופיט 4115"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":"short","action":"add","entry_type":"immediate","entry_price":null,"risk_percent":0.2,"stop_price":4567,"tp_price":4115,"quantity_text":null,"parser_confidence":0.95,"parser_notes":null}

Input: "Xauusd טריגר לכניסה 4495 סיכון 0.3 אחוז מהתיק סטופ 4565 טייק פרופיט 4115"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"Xauusd","direction":"short","action":"entry","entry_type":"trigger","entry_price":4495,"risk_percent":0.3,"stop_price":4565,"tp_price":4115,"quantity_text":null,"parser_confidence":0.95,"parser_notes":null}

Input: "זהב STOP על כל העסקה עובר ל 4526"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":"short","action":"stop_update","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":4526,"tp_price":null,"quantity_text":null,"parser_confidence":0.9,"parser_notes":null}

Input: "META יש להפחית חצי מהעסקה האחרונה של סיכון 0.2%"
Output: {"is_trade":true,"asset":"META","asset_raw":"META","direction":"long","action":"reduce","entry_type":null,"entry_price":null,"risk_percent":0.2,"stop_price":null,"tp_price":null,"quantity_text":"חצי מהעסקה האחרונה","quantity_fraction":null,"close_percent":null,"parser_confidence":0.85,"parser_notes":"חצי מרגל בודדת, לא אחוז מכלל הפוזיציה"}

Input (percentage scale-out with price): "זהב לסגור 20% מהפוזיציה במחיר 4442"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":null,"action":"reduce","entry_type":null,"entry_price":null,"exit_price":4442,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"20%","quantity_fraction":null,"close_percent":20,"parser_confidence":0.95,"parser_notes":null}

Input: "META סיכון 0.15 אחוז טריגר לכניסה 616 STOP 595 TP 689"
Output: {"is_trade":true,"asset":"META","asset_raw":"META","direction":"long","action":"entry","entry_type":"trigger","entry_price":616,"risk_percent":0.15,"stop_price":595,"tp_price":689,"quantity_text":null,"parser_confidence":0.95,"parser_notes":null}

Input (clean template): "זהב שורט — כניסה\nכניסה: לימיט 4495\nסיכון: 0.3% מהתיק\nסטופ: 4565\nטייק: 4115"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":"short","action":"entry","entry_type":"limit","entry_price":4495,"risk_percent":0.3,"stop_price":4565,"tp_price":4115,"quantity_text":null,"parser_confidence":0.97,"parser_notes":null}

Input (management, short form): "זהב — סטופ ל-4526"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":null,"action":"stop_update","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":4526,"tp_price":null,"quantity_text":null,"parser_confidence":0.93,"parser_notes":null}

Input (partial close — last leg only): "זהב יש לסגור עסקה אחרונה. נוסיף מחר עם וודאות"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":null,"action":"reduce","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"עסקה אחרונה","parser_confidence":0.9,"parser_notes":"סגירת הרגל האחרונה בלבד, הפוזיציה ממשיכה"}

Input (full close): "שורט זהב לסגור כרגע. אם יחזור למטה נפתח שוב"
Output: {"is_trade":true,"asset":"XAUUSD","asset_raw":"זהב","direction":"short","action":"close","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":null,"parser_confidence":0.9,"parser_notes":null}

Input (limit fill confirmation): "לימיט נתפס"
Output: {"is_trade":true,"asset":null,"asset_raw":null,"direction":null,"action":"fill","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":null,"parser_confidence":0.85,"parser_notes":"אישור שהלימיט נכנס"}

Input (immediate, price stated at the end): "PLTR\nסיכון 0.2 אחוז מהתיק\nכניסה מיידית\nSTOP 134\nTP 200\n\nמחיר נוכחי 140"
Output: {"is_trade":true,"asset":"PLTR","asset_raw":"PLTR","direction":"long","action":"entry","entry_type":"immediate","entry_price":140,"exit_price":null,"risk_percent":0.2,"stop_price":134,"tp_price":200,"quantity_text":null,"quantity_fraction":null,"close_percent":null,"parser_confidence":0.95,"parser_notes":null}

Input (stock long): "AAPL לונג\n\nכניסה מיידית\nסיכון 0.25%\n\nSTOP\n270\n\nTP\n329"
Output: {"is_trade":true,"asset":"AAPL","asset_raw":"AAPL","direction":"long","action":"entry","entry_type":"immediate","entry_price":null,"risk_percent":0.25,"stop_price":270,"tp_price":329,"quantity_text":null,"parser_confidence":0.95,"parser_notes":null}

Input (Nikkei limit): "יפני JPY225\nלימיט לכניסה ללונג\nמחירי FTMO\nסיכון 0.3% מהתיק\n60100\nSTOP\n59400\nTP\n64500"
Output: {"is_trade":true,"asset":"JP225","asset_raw":"יפני JPY225","direction":"long","action":"entry","entry_type":"limit","entry_price":60100,"risk_percent":0.3,"stop_price":59400,"tp_price":64500,"quantity_text":null,"parser_confidence":0.9,"parser_notes":null}

Input: "מזכיר לכם את התזה המרכזית שלנו. שוק המניות רותח וכל הכסף מופנה לאפיק הזה."
Output: {"is_trade":false,"asset":null,"asset_raw":null,"direction":null,"action":null,"entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":null,"quantity_fraction":null,"parser_confidence":0.97,"parser_notes":null}`;

// Stocks channel ("מסחר מומנטום סווינג הון עצמי"). Free-text narration of
// scaling in/out of US momentum stocks. One message may describe SEVERAL tickers,
// so this returns a LIST of signals (empty list = pure commentary).
const STOCKS_PROMPT = `You parse messages from a Hebrew-language momentum-STOCKS trading Discord channel into a list of structured trade events.

These messages narrate scaling in and out of US momentum stocks. Position size is QUALITATIVE — a fraction of a "full" position — never a risk percentage and rarely a price. ONE message can mention SEVERAL tickers and several actions; return ONE signal object per distinct ACTIONABLE trade event.

Return {"signals": [...]}. If the message is pure commentary with no trade action, return {"signals": []}.

COMMENTARY (produces NO signals): market thesis, session/Zoom announcements ("מתחילים לייב", links, passwords, @everyone), recordings ("הקלטת הסשן עלתה", "מיקוד לייזר עלה"), pure status/cheering with no action ("השוק בטירוף", "הרוב כבר עמוק בכסף", a ticker followed only by emoji like "Soxl 💥", "נראית טוב כבר ללא סיכון"), and conditional intentions that have NOT happened yet ("מתחת ל 220 soxl אממש עוד חלק", "מעל גבוה יומי אוסיף" — these are plans, not executed trades).

For EACH actionable event:
- asset: the ticker in UPPERCASE (SOXL, SOFI, SIDU, SIMO, SNAL, SMCI, QCOM, HYLN, BW, LAES, FAS, FAZ, ZETA, RXT, SMH, APPS, FCEL, CRCL, DXYZ, QBTS, NUAI, MSTR...). asset_raw = as written ("Soxl").
- is_trade: always true (only actionable events are in the list).
- direction: "long" by default (these are momentum longs). Only "short" if explicitly short.
- action:
  - "entry"  — opening a NEW position: "פתחתי שליש כמות", "נכנסתי כמות קטנה", "פתחתי במקום BW", "מצטרפת... פתחתי".
  - "add"    — increasing an existing position: "הוספתי עוד חלק", "הגדלתי עוד חלק", "חזרתי לכמות מלאה", "חזרתי לכמות מקורית", "חודשה כמות מלאה", "החזרתי את ההפחתה", "X כמות מלאה" when it raises size.
  - "reduce" — partial trim / realize: "הפחתתי חצי", "מימשתי שליש", "מימשתי עוד חלק", "חלק נוסף מומש", "חצי מומש", "2/3 מומש", "חזרתי ל שליש כמות" (when lowering).
  - "close"  — full exit: "סגרתי", "נסגרה", "בחוץ", "סגרתי בכניסה", "מימשתי גם את היתרה" (realized the remainder).
  - "stop_update" — moving the stop: "STOP לכניסה", "סטופ בכניסה" (stop to breakeven), "סטופ אזורי 7.15", "STOP נמוך יומי".
- entry_type: null (this channel has no immediate/limit/trigger templates).
- entry_price / exit_price / tp_price: null unless an explicit executed number is written. risk_percent: ALWAYS null here.
- stop_price: a number ONLY when explicitly given ("סטופ אזורי 7.15" → 7.15). Descriptive stops ("מתחת לנמוך", "נמוך יומי", "לכניסה"/breakeven) → null, and say so in parser_notes.
- quantity_fraction: the size this event refers to, as a fraction of a full position:
  "כמות מלאה"/"מלאה"/"כמות מקורית" → 1; "2/3"/"שני שליש" → 0.667; "חצי"/"חצי כמות" → 0.5; "שליש"/"שליש כמות" → 0.333; "כמות קטנה" → 0.25. If the amount is vague ("עוד חלק", "חלק", "יתרה") → null.
- quantity_text: the Hebrew size phrase verbatim ("שליש כמות", "חצי", "כמות קטנה", "עוד חלק", "יתרה") or null.
- close_percent: ALWAYS null in this channel.
- current_price: ALWAYS null in this channel.
- parser_confidence: 0..1. Use <0.6 when the fraction or stop is vague so it gets flagged for manual review.
- parser_notes: one short Hebrew note when something is ambiguous, else null.

EXAMPLES:

Input: "SOXL פתחתי שליש כמות סטופ קצת מתחת לנמוך"
Output: {"signals":[{"is_trade":true,"asset":"SOXL","asset_raw":"SOXL","direction":"long","action":"entry","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"שליש כמות","quantity_fraction":0.333,"parser_confidence":0.9,"parser_notes":"סטופ תיאורי מתחת לנמוך"}]}

Input: "נכנסתי שליש כמות FAS תעודה ממונפת על הסקטור הפיננסי\nפתחתי שליש כמות LAES דובר בסשן\nHYLN חזרתי לכמות קטנה"
Output: {"signals":[{"is_trade":true,"asset":"FAS","asset_raw":"FAS","direction":"long","action":"entry","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"שליש כמות","quantity_fraction":0.333,"parser_confidence":0.9,"parser_notes":null},{"is_trade":true,"asset":"LAES","asset_raw":"LAES","direction":"long","action":"entry","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"שליש כמות","quantity_fraction":0.333,"parser_confidence":0.9,"parser_notes":null},{"is_trade":true,"asset":"HYLN","asset_raw":"HYLN","direction":"long","action":"reduce","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"כמות קטנה","quantity_fraction":0.25,"parser_confidence":0.8,"parser_notes":"חזרה לכמות קטנה = הפחתה"}]}

Input: "HYLN סגרתי, פתחתי במקום\nBW\nשליש כמות"
Output: {"signals":[{"is_trade":true,"asset":"HYLN","asset_raw":"HYLN","direction":"long","action":"close","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":null,"quantity_fraction":null,"parser_confidence":0.9,"parser_notes":null},{"is_trade":true,"asset":"BW","asset_raw":"BW","direction":"long","action":"entry","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"שליש כמות","quantity_fraction":0.333,"parser_confidence":0.9,"parser_notes":null}]}

Input: "Smci נראית טוב על הגבוהים כבר ללא סיכון"
Output: {"signals":[]}

Input: "SMCI מימשתי שליש\nSIDU כבר 7.2 🔥\nהשוק בטירוף"
Output: {"signals":[{"is_trade":true,"asset":"SMCI","asset_raw":"SMCI","direction":"long","action":"reduce","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":"שליש","quantity_fraction":0.333,"parser_confidence":0.9,"parser_notes":null}]}

Input: "Apps כמות מלאה סטופ אזורי 7.15"
Output: {"signals":[{"is_trade":true,"asset":"APPS","asset_raw":"Apps","direction":"long","action":"add","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":7.15,"tp_price":null,"quantity_text":"כמות מלאה","quantity_fraction":1,"parser_confidence":0.85,"parser_notes":null}]}

Input: "SMCI STOP לכניסה"
Output: {"signals":[{"is_trade":true,"asset":"SMCI","asset_raw":"SMCI","direction":"long","action":"stop_update","entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":null,"quantity_fraction":null,"parser_confidence":0.85,"parser_notes":"סטופ לכניסה (breakeven)"}]}

Input: "מתחילים לייב עוד מספר דקות. שימו לב יש סיסמא: 5482 @everyone"
Output: {"signals":[]}`;

function toParsedSignal(p: z.infer<typeof SignalSchema>): ParsedSignal {
  return {
    is_trade: p.is_trade,
    asset: p.asset,
    asset_raw: p.asset_raw,
    direction: p.direction,
    action: p.action,
    entry_type: p.entry_type,
    entry_price: p.entry_price,
    exit_price: p.exit_price,
    current_price: p.current_price,
    risk_percent: p.risk_percent,
    stop_price: p.stop_price,
    tp_price: p.tp_price,
    quantity_text: p.quantity_text,
    quantity_fraction: p.quantity_fraction,
    close_percent: p.close_percent,
    parser_confidence: p.parser_confidence,
    parser_notes: p.parser_notes,
  };
}

// portfolio_risk channels: one signal per message.
export async function parseTradeMessage(rawContent: string): Promise<ParsedSignal> {
  const message = await client.messages.parse({
    model: PARSER_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: PORTFOLIO_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: rawContent }],
    output_config: { format: zodOutputFormat(SignalSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error('Parser returned no structured output');
  }
  return toParsedSignal(parsed);
}

// momentum_stocks channel: a message can yield several trade events.
export async function parseStockMessage(rawContent: string): Promise<ParsedSignal[]> {
  const message = await client.messages.parse({
    model: PARSER_MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: STOCKS_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: rawContent }],
    output_config: { format: zodOutputFormat(StockBatchSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error('Parser returned no structured output');
  }
  return parsed.signals.map(toParsedSignal);
}
