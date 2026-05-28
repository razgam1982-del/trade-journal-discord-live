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
  risk_percent: z.number().nullable(),
  stop_price: z.number().nullable(),
  tp_price: z.number().nullable(),
  quantity_text: z.string().nullable(),
  parser_confidence: z.number(),
  parser_notes: z.string().nullable(),
});

// Stable, frozen system prompt — cached across requests (cache_control below).
const SYSTEM_PROMPT = `You parse messages from a Hebrew-language trading Discord channel into structured trade signals.

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
  - "reduce" — PARTIAL close; the position stays open. Includes "יש להפחית"/"להפחית חצי"/"הפחתה", and also "לסגור עסקה אחרונה" (close only the last leg) and "לסגור עסקאות שנפתחו היום" (close only today's legs). Put the amount/scope in quantity_text ("חצי", "עסקה אחרונה", "של היום").
  - "close"  — FULL close of the ENTIRE position ("לסגור את כל העסקה", "סגירה", or "לסגור כרגע" when the whole position is closed). Do NOT use for partial closes — those are "reduce".
  - "stop_update" — moving the stop on an existing position ("STOP עובר ל 4526", "STOP על כל העסקה עובר ל..."). Put the new stop in stop_price.
  - "cancel" — cancelling a pending order ("ביטול העסקה", "מבוטל", "מבוטלים").
  - "fill"   — confirming a pending limit/trigger ENTERED ("לימיט נתפס", "לימיט בפנים", "לימיט הופעל", "בפנים", "נכנס"). No new prices; just confirms the prior pending entry filled.
  - "other"  — a trade-related message that fits none of the above.
- entry_type + entry_price: how the position is entered.
  - "immediate" — "כניסה מיידית" / "כניסה: מיידית". entry_price is the executed price if the user wrote one ("כניסה מיידית 4490"), else null.
  - "trigger" — breakout entry: "טריגר לכניסה 4495" / "כניסה: טריגר 4495". Put the level in entry_price.
  - "limit" — pullback entry: "לימיט 4495" / "כניסה: לימיט 4495". Put the level in entry_price.
  - null if no entry instruction (e.g. a stop_update or close message).
- stop_price / tp_price: "סטופ"/"STOP"→stop_price, "טייק פרופיט"/"טייק"/"TP"→tp_price.
- risk_percent: the portfolio risk percent as a number ("סיכון 0.2 אחוז" → 0.2). null if not stated.
- quantity_text: free-text size for reductions ("חצי") or null.
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
Output: {"is_trade":true,"asset":"META","asset_raw":"META","direction":"long","action":"reduce","entry_type":null,"entry_price":null,"risk_percent":0.2,"stop_price":null,"tp_price":null,"quantity_text":"חצי","parser_confidence":0.85,"parser_notes":"הפחתה של חצי מההוספה האחרונה"}

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

Input (stock long): "AAPL לונג\n\nכניסה מיידית\nסיכון 0.25%\n\nSTOP\n270\n\nTP\n329"
Output: {"is_trade":true,"asset":"AAPL","asset_raw":"AAPL","direction":"long","action":"entry","entry_type":"immediate","entry_price":null,"risk_percent":0.25,"stop_price":270,"tp_price":329,"quantity_text":null,"parser_confidence":0.95,"parser_notes":null}

Input (Nikkei limit): "יפני JPY225\nלימיט לכניסה ללונג\nמחירי FTMO\nסיכון 0.3% מהתיק\n60100\nSTOP\n59400\nTP\n64500"
Output: {"is_trade":true,"asset":"JP225","asset_raw":"יפני JPY225","direction":"long","action":"entry","entry_type":"limit","entry_price":60100,"risk_percent":0.3,"stop_price":59400,"tp_price":64500,"quantity_text":null,"parser_confidence":0.9,"parser_notes":null}

Input: "מזכיר לכם את התזה המרכזית שלנו. שוק המניות רותח וכל הכסף מופנה לאפיק הזה."
Output: {"is_trade":false,"asset":null,"asset_raw":null,"direction":null,"action":null,"entry_type":null,"entry_price":null,"risk_percent":null,"stop_price":null,"tp_price":null,"quantity_text":null,"parser_confidence":0.97,"parser_notes":null}`;

export async function parseTradeMessage(rawContent: string): Promise<ParsedSignal> {
  const message = await client.messages.parse({
    model: PARSER_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: rawContent }],
    output_config: { format: zodOutputFormat(SignalSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error('Parser returned no structured output');
  }

  return {
    is_trade: parsed.is_trade,
    asset: parsed.asset,
    asset_raw: parsed.asset_raw,
    direction: parsed.direction,
    action: parsed.action,
    entry_type: parsed.entry_type,
    entry_price: parsed.entry_price,
    risk_percent: parsed.risk_percent,
    stop_price: parsed.stop_price,
    tp_price: parsed.tp_price,
    quantity_text: parsed.quantity_text,
    parser_confidence: parsed.parser_confidence,
    parser_notes: parsed.parser_notes,
  };
}
