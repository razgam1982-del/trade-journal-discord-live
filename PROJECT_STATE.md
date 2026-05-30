# Trade Journal — מצב הפרוייקט (handoff)

מסמך זה נכתב כדי שצ'ט/מפתח חדש יוכל לקפוץ פנימה ולעבוד בלי לקרוא 50K טוקנים של היסטוריה. עדכן אותו כשהמצב משתנה משמעותית.

נכון ל: 2026-05-30 (commit `4ebcd4a`)

---

## 1. סקירה על שטחית בכמה משפטים

יומן מסחר לימודי בעברית מבוסס Next.js 16 + Supabase, שמתעד עסקאות שמגיעות מערוצי דיסקורד דרך bot. יש 3 ערוצים פעילים במסד:

| `channel_id` | שם | סוג (`template`) |
|---|---|---|
| `1488604363260952767` | עסקאות-נדירות-מיוחדות | `portfolio_risk` |
| `1334020841511456908` | מומנטום סווינג חוזים נוסטרו | `portfolio_risk` |
| `932256154439020544` | מסחר מומנטום סווינג הון עצמי | `momentum_stocks` |

`portfolio_risk` → אחוז סיכון מהתיק (sigma R, מכפיל רווח/הפסד וכו'). `momentum_stocks` → דולרים מוחלטים (מניות, כמות, עמלות).

**אתר חי**: `tradingbot-hazel-phi.vercel.app` (production = main branch על Vercel)
**DB**: Supabase. **אותו DB משמש את localhost ואת production** — כל write פוגע בשניהם.

---

## 2. קבצי מפתח (קצר)

### דפים
- `app/page.tsx` — בחירת ערוץ
- `app/positions/page.tsx` — היומן הראשי (portfolio_risk). מתחלף ל-`StockJournal` אם הערוץ הנבחר הוא `momentum_stocks`
- `app/journal/page.tsx` — תצוגת סיגנלים גולמיים (debug)
- `app/api/discord-webhook/route.ts` — endpoint שמקבל הודעות מהבוט
- `app/api/ingest/route.ts` — ingest ידני (Test Alert)

### שירותים
- `services/position-service.ts` — **הלב**. מקבץ סיגנלים ל-positions לפי `asset+direction`, מחשב P/L per-leg, סטטוסים. כל שינוי בלוגיקה של חישוב/קיבוץ עובר פה.
- `services/trade-signal-service.ts` — CRUD על `trade_signals` כולל soft-delete.
- `services/trade-parser-service.ts` — Claude-based parser. ההודעה נשלחת ל-Claude שמחזיר JSON מובנה. גם הבוט החי וגם "פתח עסקה ידנית" משתמשים בו.
- `services/discord-message-service.ts` — upsert על `discord_messages`.
- `services/channel-service.ts` — רשימת ערוצים.
- `services/stock-trade-service.ts` — `stock_trades` (סכימה שונה לחלוטין).
- `services/market-price-service.ts` — מחיר נוכחי לכל asset (מטופל ידנית מה-UI או דרך feed).
- `services/settings-service.ts` — `portfolio_size` ועוד הגדרות גלובליות.
- `services/benchmark-service.ts` — שולף SPX מ-Yahoo Finance, cache 1 שעה.

### רכיבים
- `components/PositionsTable.tsx` — רשימת העסקאות בנוסטרו. בתוכו: `MonthHeader` + `MonthBreakdown` + `MonthNav` + הקובייה הגדולה של כל עסקה.
- `components/StockJournal.tsx` — היומן של מניות. מבנה שונה (סכימה אחרת) אבל אותו רוח: month nav, month header, month breakdown.
- `components/PositionsCharts.tsx` — גרפים (עקומת הון מצטברת עם SPX overlay, רווח/הפסד פר עסקה, פר נכס).
- `components/OpenTradeButton.tsx` + `ClosePositionButton.tsx` — פעולות ידניות שמייצרות discord_message + trade_signal סינתטיים.
- `components/EditMode.tsx` + `EditSignalButton.tsx` — מצב עריכה (`?key=EDIT_SECRET`), עריכת רגל בודדת.
- `components/Disclaimer.tsx` — האזהרה המודגשת: יומן סימולציות לימודי.
- `components/ProfitFactorHero.tsx` — קובייה של מכפיל רווח/הפסד (KPI ראשי).

### Server Actions
`app/positions/actions.ts` — חשובים במיוחד:
- `closePositionManually(anchorSignalId, exitPrice)` — מוסיף signal סינתטי `close_percent: 100`
- `openTradeManually(channelId, rawText)` — מריץ פרסר Claude על טקסט גולמי
- `saveSignalEdits(id, fields)` — עריכת רגל
- `saveMarketPrice(asset, price)` — מחיר נוכחי

`app/stocks/actions.ts` — `removeStockTrade`, `restoreStockTrade`, וכו'.

---

## 3. כללי עסקיים / convention־ים שלמדנו

הכללים האלה **חייבים להישמר** בקוד. רובם נולדו מבאגים שהמשתמש איתר.

### חישוב עסקאות (position-service.ts)
- **קיבוץ**: `asset+direction`. כל הסיגנלים על אותה אסימטריה הם **פוזיציה אחת** ביומן.
- **רגל לכל leg**: לכל entry יש `remaining` עצמאי. הפחתה/סגירה צורכים מ-`remaining` של כל רגל פתוחה.
- **`חצי`/`שליש`/`רבע` = חלק מה-remaining הנוכחי** של כל רגל פתוחה, לא מה-original. דוגמה: לאחר חצי + חצי, נשארים 25% (לא 0%).
- **`עסקה אחרונה` / `N עסקאות אחרונות`** = leg-scoped, סוגר רק את הכניסות האחרונות. עוקף ע"י **`close_percent` מפורש או fraction >= 100%** (תיקון: `position-service.ts` — חיפוש `explicitPct`).
- **`STOP X נקודות` (כמו ב-US100, JP225)** = מרחק נקודות, לא מחיר אבסולוטי. מחושב ב-`prepare`/`momentum_prepare.mjs` באופן רגרסיבי.
- **כניסות מרובות**: כל אחת עם stop/risk משלה. חישוב P/L per-leg, מצרפים. גם time-aware — הפחתה ב-21:56 לא נוגעת בכניסה ב-22:23.
- **כסף שהושאר על הרצפה** (`left_on_floor`) — דורש `peak_price` ידני.

### זירואינג של רווחים פתוחים (לקובץ HTML מקומי בעיקר, לא ל-DB)
- **שורט עם הפסד פתוח** → אפס. הסיבה: סגירה בכניסה, פרסר פספס.
- **עסקאות מרץ/אפריל שמוצגות כפתוחות** → אפס. סטייליות.
- **עסקאות מאי שלא AAPL ומוצגות פתוחות** → אפס. רק AAPL באמת פתוח עכשיו.

הכללים האלה ב-prepare scripts ב-Documents/. לא נגעו בקוד הראשי כי הם ספציפיים לסיבוב backfill מסוים.

### תצוגה
- **חודשים: חדש למעלה, ישן למטה**. גם בתוך חודש: חדש למעלה (`b.opened_at.localeCompare(a.opened_at)`).
- **גרף עקומת הון: ישן בשמאל, חדש בימין** (כי גרף בזמן, LTR).
- **תווית תקופה בכל KPI סך-תיקי**: `מרץ – מאי 2026`. ב-`positions/page.tsx` חישוב `periodMonths`.
- **מינוף x1/x2/x3**: query param `?lev=N`. מוכפל על pnl_dollars/pnl_percent/unrealized/risk. R לא משתנה (יחסי).
- **רווח פתוח לא נכנס לסיכום הראשי כברירת מחדל** (יותר מדי רעש). יש opt-in.
- **`+ פתח עסקה ידנית`** ליד `▲ צמצם תצוגה` בראש רשימת העסקאות.
- **חודשי בורר** למעלה (chips). לחיצה → קופץ לחודש למטה.

### אבטחה
- **`assertEditor()` חובה** בכל server action שמשנה DB.
- מצב עריכה מופעל ע"י `?key=EDIT_SECRET` בלינק. `EDIT_SECRET = eWSNUkRRbApU8bbapmtjf5sgVZNZokwn` (ב-Vercel env, **לא ב-git**).
- כל שאר העולם מקבל רק קריאה.

### Git
- שם המשתמש לא מוגדר ב-repo הזה. השתמש ב-`git -c user.email=raz.gam1982@gmail.com -c user.name="Raz Gamliel" commit ...`
- **לעולם אל תעדכן global git config**.
- Co-Authored-By: Claude (כפי שמופיע בקומיטים).

---

## 4. סכימת DB (סכימתי, לפרטים `supabase/migrations/`)

### `discord_messages`
- `id` (uuid), `discord_message_id` (יחיד; אם `backfill-*` או `manual-*` או רגיל), `channel_id`, `channel_name`, `author`, `raw_content`, `created_at`, `received_at`

### `trade_signals`
- FK: `message_id` → `discord_messages.id`
- `signal_index` (אם הודעה אחת מולידה מספר סיגנלים)
- `asset`, `asset_raw`, `direction` (`long`/`short`), `action` (`entry`/`reduce`/`close`/`cancel`/`stop_update`/`other`), `entry_type` (`immediate`/`trigger`/`limit`)
- `entry_price`, `exit_price`, `stop_price`, `tp_price`, `risk_percent`, `quantity_text`, `close_percent`
- `parser_confidence`, `parser_notes`, `needs_review`, `manually_edited`, `excluded`, `filled`, `peak_price`
- `deleted_at` (soft-delete)

### `stock_trades` (סכימה שונה)
- `id`, `channel_id`, `trade_date`, `symbol`, `direction`, `risk_dollars`
- `entries: jsonb` — מערך של `{ f: fee, p: price, q: quantity }`
- `exits: jsonb` — אותו דבר
- `seq` (סדר ביום), `created_at`, `deleted_at`, `peak_price`

### `channels`
- `channel_id`, `name`, `template`, `enabled`

### `app_settings` / `settings`
- `portfolio_size` (default $100,000)
- `auto_approve` (מתג גלובלי לסיגנלים אל MT4)

### `market_prices`
- `asset`, `price`, `set_at` — נקרא ב-position-service לחישוב unrealized.

---

## 5. תיקיות מקבילות (לא בקוד הראשי) — backfill workflows

הכל ב-`C:/Users/razga/Documents/`:

### Rare/special channel (מרץ-אפריל-מאי 2026, כבר ב-DB)
- `backfill_rare_by_trade.csv` — מקור (מרץ+אפריל)
- `backfill_rare_may_by_trade.csv` — מקור (מאי)
- `backfill_rare_by_trade_filled.csv` — אחרי Yahoo
- `backfill_prices.mjs` — Yahoo (קורא וכותב לאותו filled)
- `backfill_prices_fixup.mjs` — תיקונים ידניים (XAU 20.04, MSTR 14.04)
- `backfill_apply_clarifications.mjs` — תיקונים שהמשתמש אישר
- `backfill_prepare.mjs` — בונה JSON + HTML preview
- `backfill_ingest.mjs` / `backfill_ingest_may_only.mjs` — מכניסים ל-DB
- `backfill_rare_prepared.json` — אחרון
- `backfill_rare_preview.html` — תצוגה מקדימה

### Momentum swing channel (מרץ-מאי 2026, כבר ב-DB)
- `discord_momentum_swing_part1.txt` + `part2.txt` — מקור (3/4 → 5/27, paste ידני)
- `discord_momentum_futures_mar_apr_may_2026_RAW.txt` — לא רלוונטי יותר
- `momentum_parse.mjs` — CSV builder
- `backfill_momentum_by_trade.csv` — CSV
- `momentum_prices.mjs` — Yahoo
- `momentum_prepare.mjs` — JSON + HTML preview
- `momentum_ingest_with_replace.mjs` — מחק 40 nostro/LIVE ישנים, הכניס 210 חדשים
- `backfill_momentum_prepared.json`
- `backfill_momentum_preview.html`

### Stocks (2026, כבר ב-DB)
- `stocks_2026.xlsx` — הקובץ ש-downloaded מ-Google Sheets
- `xlsx_tmp/parse_2026.mjs` — חילוץ עסקאות מ-xlsx
- `xlsx_tmp/build_preview.mjs` — HTML preview
- `xlsx_tmp/ingest_stocks.mjs` — הכניס 41 חדשות (Jan-Apr) ל-DB
- `xlsx_tmp/parsed_2026.json` + `to_add.json` — תוצרים
- `stocks_2026_preview.html` — תצוגה מקדימה (אישר המשתמש)

**הפרסר של המניות** מזהה: `סימולציה SYMBOL DD.MM.YY` בעמודה B, ולכל שורה (entry בעמודות F-I, exit בעמודות J-M). עמלת ברירת מחדל בקובץ = $2.5.

**Rollback מהיר אם משהו צורם**:
- Rare: `discord_message_id LIKE 'backfill-rare-%'`
- Momentum: `discord_message_id LIKE 'backfill-momentum-%'`
- Stocks: `seq > 30` (יש 30 רשומות קודמות שלא נגעו)

---

## 6. מה נשאר בתור / מה הולך הלאה

### בצ'ט הזה (משחק קל, קוסמטיקה ועוד)
- **עמלת ברירת מחדל $2.5 גלובלית** למניות, ניתנת לעריכה, אוטומטית על leg חדש. צריך:
  - הוספת שדה `default_commission` ב-`settings-service.ts`
  - UI ב-StockJournal (אולי בורר בכותרת)
  - שינוי `blankForm()` שתשתמש בו לרגלים חדשות
- **עוד התאמות נוסטרו → מניות**: סקציית "ביצועים — חודש נוכחי" עם KPIs, Sharpe/Sortino + השוואה ל-SPX (השוואה למניות כנראה מתאימה יותר ל-NDX או QQQ), כפתורי פתח/סגור עסקה ידנית גם במניות.
- **קוסמטיקה לפי בקשה**

### בצ'ט חדש (פרוייקט קריטי משלו)
- **Discord → Telegram → cTrader (FTMO)**. יש כבר `ctrader-bot/` בתיקיה האחות `TRADINGBOT/`. ה-MT4 EA הקיים (`mt4-ea/TradingBotEA.mq5` ב-TRADINGBOT) הוא ה-reference. cTrader Open API הוא Protobuf-over-TLS עם OAuth, שונה מ-MT5.

---

## 7. גיט / דפלוי

- `master` = פרודקשן. Vercel דוחף אוטומטית.
- ה-CI / Vercel לוקח 60-90 שניות לבנייה אחרי `git push`.
- `npx tsc --noEmit` לבדיקה לוקאלית לפני commit (לא יושב hook חובה).
- אין tests אוטומטיים. בודקים ידנית בלוקאל / Vercel preview.

---

## 8. רשימת קומיטים אחרונים שחשוב להכיר

```
4ebcd4a Stocks journal: month-nav chips above trade list, clickable to scroll
3efc9de Add 'פילוח חודשי' detailed breakdown above each month's trades
e79fe9c Stocks journal: sort trade list newest first
5c46ce4 Hide trade-label header on equity chart tooltip + count open trades w/o market price
fb97648 Center the leverage selector in 2 rows
4618173 Relocate two header controls
1eb1169 Add 'סך הכל (ממומש + פתוח)' KPI — visible only when open positions exist
af9879c Replace SPX KPI with narrative interpretation vs Sharpe/Sortino
e72c114 Benchmark + risk-adjusted metrics + leverage what-if
fb4d083 Add 'סגור עסקה ידנית' button on open positions
0b08c41 Add 'פתח עסקה ידנית' — paste Discord text, parser auto-fills
1fd5f41 Broaden 100% override: any fraction >= 100% closes whole position
a157379 Manual close_percent overrides leg-scoped 'אחרונה'/'היום' phrasing
9feb816 Split performance into two sections: full period + current month
da09312 Add 'תקופה' month-range caption under realized + total KPIs
21132ca Unify wording: 'יומן סימולציות לימודי' everywhere
6d120e0 Emphasize disclaimer
```

---

## 9. מילון מיני (מונחים בהתכתבויות עם המשתמש)

- **"סוגרת בכניסה"** = הפרסר פספס את הסגירה, אבל בפועל העסקה נסגרה במחיר הכניסה (אפס רווח/הפסד). נוהג נפוץ בעסקאות שורט.
- **"מתג auto-approve"** = מתג גלובלי שאם דלוק, סיגנלים יוצאים ישר ל-MT4 בלי אישור טלגרם.
- **"פילוח חודשי"** = 10 קוביות עם KPIs לחודש (חדש, קומיט 3efc9de).
- **"מינוף מה היה אם"** = `?lev=2|3`, מציג מה היה קורה בסיכון כפול/משולש.
- **"כסף שהושאר על הרצפה"** = אם היו יוצאים בשיא במקום בפועל, כמה כסף נוסף היה מצטבר.
