# Discord OAuth — הגדרות ל-Vercel

מצב הקוד: הזרימה בנויה ועובדת אבל **לא תפעל בפרודקשן עד שלא תזין את משתני הסביבה ב-Vercel**. עד אז, הצופים יראו `Internal Server Error` כשנכנסים לאתר (כי `SESSION_SECRET` חסר).

## רשימת המשתנים הנדרשים

| משתנה | מה זה | איפה משיגים |
|---|---|---|
| `SESSION_SECRET` | מחרוזת אקראית לחתימת עוגיות צפייה | צור עכשיו: 32 בייטים אקראיים (ראה הוראה למטה) |
| `DISCORD_CLIENT_ID` | מזהה האפליקציה של Discord | Discord Developer Portal → New Application |
| `DISCORD_CLIENT_SECRET` | סוד האפליקציה | אותו מקום |
| `DISCORD_BOT_TOKEN` | טוקן של בוט שמותקן בשרת שלך | Discord Developer Portal → Bot tab |
| `DISCORD_GUILD_ID` | מזהה השרת שלך | Discord → Server Settings → Widget → Server ID (או הפעל Developer Mode וקליק ימני על שם השרת) |
| `DISCORD_REQUIRED_ROLE_ID` | מזהה התפקיד "חבר משלם" / "תלמיד פעיל" | Server Settings → Roles → קליק ימני → Copy ID (במצב Developer Mode) |
| `COMMUNITY_JOIN_URL` | קישור לדף הצטרפות לקהילה (מוצג למי שאין לו תפקיד) | קישור משלך (למשל לטופס/דף נחיתה) |

> אם יש כמה תפקידים שמקבלים גישה (למשל "חבר משלם" + "מודרטור") — שים אותם ב-`DISCORD_REQUIRED_ROLE_ID` עם פסיק ביניהם: `123,456,789`.

## צעד-אחר-צעד

### 1. ייצור SESSION_SECRET

ב-PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | %{ Get-Random -Min 0 -Max 256 }))
```
או בכל לינוקס/macOS:
```bash
openssl rand -base64 32
```
העתק את התוצאה. **לא לשתף עם אף אחד.**

### 2. הגדרת אפליקציית Discord OAuth

1. כנס ל-https://discord.com/developers/applications
2. **New Application** → תן שם (למשל "Trade Journal Login")
3. בסרגל הצדדי: **OAuth2**
4. תחת **Redirects** הוסף את שתי הכתובות:
   - `http://localhost:3000/api/auth/discord/callback` (לפיתוח לוקאלי)
   - `https://tradingbot-hazel-phi.vercel.app/api/auth/discord/callback` (פרודקשן)
5. בראש הדף יש **CLIENT ID** ו-**CLIENT SECRET** — העתק את שניהם

### 3. יצירת הבוט (לבדיקת תפקידים)

1. באותה אפליקציה: סרגל צד → **Bot**
2. לחץ **Reset Token** → שמור את ה-token (זה ה-`DISCORD_BOT_TOKEN`)
3. תחת **Privileged Gateway Intents** הפעל את:
   - **SERVER MEMBERS INTENT** (חובה — בלי זה הבוט לא יוכל לקרוא את התפקידים)
4. סרגל צד → **OAuth2** → **URL Generator**
5. בחר scopes: `bot`
6. תחת **Bot Permissions** סמן: `View Channels` (זה מספיק)
7. העתק את ה-URL שנוצר, פתח אותו בדפדפן ובחר **את השרת שלך** → **Authorize**

### 4. השגת ה-IDs (השרת + התפקיד)

1. ב-Discord: User Settings → Advanced → הפעל **Developer Mode**
2. קליק ימני על שם השרת בסרגל הצד → **Copy Server ID** = `DISCORD_GUILD_ID`
3. Server Settings → Roles → קליק ימני על התפקיד הרלוונטי → **Copy Role ID** = `DISCORD_REQUIRED_ROLE_ID`

### 5. הוספה ל-Vercel

1. Vercel Dashboard → הפרוייקט → **Settings** → **Environment Variables**
2. הוסף את כל 7 המשתנים. סמן Production + Preview + Development (לכל הסביבות)
3. אחרי הוספה, **Redeploy** (Deployments → ⋮ → Redeploy)
4. תוך כ-2 דקות הזרימה תעלה

### 6. הוספת אותם משתנים ל-`.env.local`

עבור פיתוח לוקאלי — העתק את אותם ערכים ל-`.env.local`. אל תעלה אותו לגיט (כבר ב-`.gitignore`).

## בדיקה

1. צא ממצב עריכה אם אתה בתוכו: `https://tradingbot-hazel-phi.vercel.app/unlock?key=` (key ריק → מוחק את העוגייה)
2. גלוש לאתר → אמור להפנות ל-`/login`
3. לחץ "התחבר עם Discord" → אמור לעבור ל-Discord → לאחר אישור → לחזור ליומן
4. בדוק מ-incognito עם משתמש שלא חבר → אמור לראות הודעת "אין גישה" + קישור הצטרפות

## Rollback / כיבוי זמני

אם משהו השתבש ואתה צריך לפתוח את האתר בלי OAuth:
1. ב-`middleware.ts`, הפוך את `PUBLIC_PATHS` ל-`['/']` (כך כל הנתיבים פתוחים)
2. דחוף לפרודקשן
3. עד שתתקן את ה-env

## איך אני (הבעלים) נכנס

הקישור שלך: `https://tradingbot-hazel-phi.vercel.app/unlock?key=eWSNUkRRbApU8bbapmtjf5sgVZNZokwn`

זה מגדיר את ה-edit cookie. עם העוגייה הזו אתה רואה הכל בזמן אמת (בלי דיליי 12 שעות) ועוקף את בדיקת ה-Discord role.

## איך מי שעזב מאבד גישה

- ה-Discord API נשאל מחדש פעם ב-5 דקות (cache)
- אם הוצאת לתלמיד את התפקיד ב-Discord → תוך 5 דק' מבדיקת הדף הבא שלו, הוא יידחה
- אחרי 7 ימים העוגייה ממילא פגה גם אם לא הוצאת תפקיד
