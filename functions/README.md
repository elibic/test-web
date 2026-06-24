# functions — שכבת התראות "תמיד-חיה" (test-94822)

Cloud Functions שרצות **בענן** ולכן שולחות התראות גם כש-ה-Pi כבוי / יש הפסקת חשמל.
זה מחליף את ההתראות שרצו על ה-Pi עצמו (`shabbat_detector/notifier.py`) — שם המכשיר לא
יכול להתריע על מותו שלו.

## מה זה שולח
1. 🕯️ **כניסה למצב שבת** — מיד כש-`elevator_configs/{id}/SHABBAT_ACTIVE` עובר `false→true`.
2. ✅ **יציאה ממצב שבת** — כשעובר `true→false`.
3. ⚠️ **אין תנועה X זמן (החרגת לילה)** — פונקציה מתוזמנת (כל 10 דק') בודקת את
   `elevators/{id}/timestamp`. מודדת "שניות-יום" בלבד (מחסירה את חלון הלילה).
   **תופס גם הפסקת-חשמל**: Pi מת ⇒ ה-timestamp קופא ⇒ נספר כ"אין תנועה".

## ארכיטקטורה
- **קוד:** `index.js` (3 פונקציות + endpoint בדיקה), `lib/notify.js` (ערוצים),
  `lib/night.js` (חישוב יום/לילה מודע-TZ, נמל מ-`notifier.py`).
- **סודות** → Functions **Secrets** בלבד (לא ב-DB, לא ב-Git):
  `TELEGRAM_BOT_TOKEN`, `SMTP_PASS`, `NOTIFY_TEST_KEY`.
- **העדפות** (לא-סוד) → `/settings/notifications` ב-RTDB — ניתנות לעריכה מקונסולת Firebase
  (ובהמשך מ-`setup.html`).
- **מצב פנימי** (למניעת התראות כפולות) → `/notify_state/{id}` (נכתב ע"י הפונקציה).
- אזור: `us-central1` (תואם ל-RTDB). מופע RTDB: `test-94822-default-rtdb`.

## מבנה `/settings/notifications` (RTDB)
```json
{
  "enabled": true,
  "events": { "shabbat_enter": true, "shabbat_exit": true, "no_movement": true },
  "no_movement": { "threshold_hours": 10, "night_start": "23:00", "night_end": "06:00" },
  "channels": {
    "email": {
      "enabled": true,
      "smtp_host": "smtp.gmail.com",
      "smtp_port": 587,
      "username": "you@gmail.com",
      "from": "you@gmail.com",
      "to": ["alerts@example.com"]
    },
    "telegram": { "enabled": false, "chat_id": "123456789" }
  }
}
```
> `password`/`bot_token` **לא** כאן — הם Secrets. נמענים/`chat_id` הם ניתוב, לא סוד.
> כרגע מתחילים עם **מייל** (telegram כבוי; יופעל בהמשך — ראו index.js).

## פריסה (חד-פעמי) — מצב נוכחי: מייל
דורש את Firebase CLI ותוכנית **Blaze** (כבר פעיל).

```bash
cd functions
npm install

# 1) הגדרת הסודות שצריך עכשיו (פעם אחת; הערך מודבק כשנשאלים):
firebase functions:secrets:set SMTP_PASS         # סיסמת-אפליקציה של Gmail (16 תווים)
firebase functions:secrets:set NOTIFY_TEST_KEY   # מחרוזת אקראית לבדיקה
#   (TELEGRAM_BOT_TOKEN — בהמשך, כשנפעיל טלגרם)

# 2) הזנת ההעדפות ב-RTDB תחת /settings/notifications (קונסולה), עם channels.email.enabled=true

# 3) פריסה (או דרך GitHub Actions — ראו למטה):
firebase deploy --only functions
```

### ⚠️ Gmail — סיסמת-אפליקציה
ה-`SMTP_PASS` הוא **לא** סיסמת ה-Gmail הרגילה אלא **App Password**:
Google Account → Security → צריך **2-Step Verification מופעל** → "App passwords" →
צור סיסמה (16 תווים) → זה הערך של `SMTP_PASS`. `username`/`from` = כתובת ה-Gmail המלאה.

## בדיקה — לקבל מייל אמיתי
אחרי פריסה, פנייה ל-endpoint הבדיקה (שולח הודעה אמיתית לכל ערוץ פעיל):
```bash
curl "https://us-central1-test-94822.cloudfunctions.net/notifyTest?key=<NOTIFY_TEST_KEY>"
```
> ה-URL המדויק מודפס בסיום `firebase deploy`. בדור-2 ייתכן URL מסוג `*.run.app`.

תשובה תקינה: `{"ok":true,"results":[{"channel":"email","ok":true,...}]}` ותקבל מייל.

## פריסה אוטומטית מ-GitHub (CI/CD)
Workflow מוכן: `.github/workflows/firebase-deploy.yml`. פורס Hosting+Functions
ב-push ל-`main` (או ידנית: Actions → "Deploy to Firebase" → Run workflow).

**הקמה חד-פעמית — הוסף secret אחד לאימות** (GitHub → Settings → Secrets and
variables → Actions → New repository secret). שתי אפשרויות:

- **`FIREBASE_SERVICE_ACCOUNT`** (מומלץ): Firebase Console → ⚙️ Project settings →
  Service accounts → *Generate new private key* → הדבק את כל ה-JSON כערך ה-secret.
  ודא שלחשבון יש הרשאות פריסה (Firebase Admin + Cloud Functions Admin + Service
  Account User; ולפונקציות עם סודות גם Secret Manager Admin).
- **`FIREBASE_TOKEN`** (פשוט יותר, מיושן): מקומית `firebase login:ci` → הדבק את הטוקן.

> עדיין נדרש חד-פעמית: Blaze + `firebase functions:secrets:set ...` (ראו למעלה).
> ה-CI מריץ `npm test` לפני הפריסה — פריסה תיעצר אם הבדיקות נכשלות.

## בדיקות יחידה (חישוב יום/לילה)
```bash
cd functions && npm install && npm test
```

## מניעת כפילויות
מאחר וההתראות עברו לענן — השאר את ההתראות על ה-Pi **כבויות**
(`rfid_config.json → notifications.enabled: false`) כדי לא לקבל פעמיים.
