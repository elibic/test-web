# apps-script — ניטור והתראות (Google Apps Script)

שכבת ההתראות ה"תמיד-חיה" למעליות שבת, בגישת **Google Apps Script** — שולחת מייל
דרך `MailApp` ישירות מחשבון ה-Google שלך (**בלי SMTP, בלי סיסמת-אפליקציה, בלי Blaze**).
רצה בענן של Google ולכן עובדת גם כש-ה-Pi כבוי / הפסקת-חשמל.

> זו החלופה הפשוטה ל-`functions/` (Cloud Functions). **אל תפעיל את שתיהן יחד** —
> תקבל התראות כפולות. הקובץ `functions/` נשאר בריפו כאופציה (טריגרים מיידיים), לא חובה.

## מה זה שולח
1. 🕯️ כניסה למצב שבת · 2. ✅ יציאה ממצב שבת — לפי `elevator_configs/{id}/SHABBAT_ACTIVE`.
3. ⚠️ אין תנועה X שעות (החרגת לילה) — לפי `elevators/{id}/timestamp`; תופס גם הפסקת-חשמל.

כל ההגדרות חיות בראש `elevator-monitor.gs`. המצב הקודם נשמר ב-PropertiesService —
**אין צורך בשום צומת או כתיבה ל-Database.**

## התקנה (פעם אחת, ~5 דקות)
1. כנס ל-**https://script.google.com** → **New project**.
2. מחק את הקוד לדוגמה והדבק את כל התוכן של `elevator-monitor.gs`.
3. ערוך את בלוק ההגדרות בראש הקובץ:
   - `EMAIL_TO` — לאן לשלוח (מופרד בפסיקים).
   - `ELEVATOR_IDS` — רשימת המעליות (למשל `["A"]` או `["A","B"]`).
   - `THRESHOLD_HOURS` / שעות הלילה — לפי הצורך.
4. ודא אזור-זמן: **Project Settings (⚙️) → Time zone → (GMT+02:00/03:00) Jerusalem**.
5. **בדיקת מייל מיד:** בחר את הפונקציה `sendTestAlert` בסרגל העליון → **Run** →
   אשר את ההרשאות (מייל + רשת) → אמור להגיע מייל "🔔 בדיקת התראות". ✅
6. **טריגר מתוזמן:** ⏰ **Triggers** (בתפריט השמאלי) → **Add Trigger** →
   - Function: `monitorElevators`
   - Event source: **Time-driven** → **Minutes timer** → **Every 5 minutes** → **Save**.

זהו. מכאן הוא בודק לבד כל 5 דקות ושולח מייל בעת אירוע.

## טלגרם (להמשך)
מלא בראש הקובץ `TELEGRAM_BOT_TOKEN` ו-`TELEGRAM_CHAT_IDS`, שמור — וזהו. שאר הקוד כבר תומך.

## הערות
- אם `sendTestAlert` עבד אבל ה-DB מחזיר `Permission denied` בלוגים — קריאת ה-DB
  הציבורית חסומה; הדבק `DB_AUTH` (database secret של ramada-elev) בראש הקובץ.
- לראות לוגים: בעורך → **Executions** (▶️ בתפריט השמאלי).
- מכסות Apps Script (מאות מיילים/יום, אלפי קריאות-רשת/יום) — הרבה מעבר לצורך.
