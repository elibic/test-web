# functions — שכבת התראות "תמיד-חיה" (ramada-elev)

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
- אזור: `europe-west1` (תואם ל-RTDB). מופע RTDB: `ramada-elev-default-rtdb`.

## מבנה `/settings/notifications` (RTDB)
```json
{
  "enabled": true,
  "events": { "shabbat_enter": true, "shabbat_exit": true, "no_movement": true },
  "no_movement": { "threshold_hours": 10, "night_start": "23:00", "night_end": "06:00" },
  "channels": {
    "telegram": { "enabled": true, "chat_id": "123456789" },
    "email": {
      "enabled": false,
      "smtp_host": "smtp.gmail.com",
      "smtp_port": 587,
      "username": "you@gmail.com",
      "from": "you@gmail.com",
      "to": ["alerts@example.com"]
    }
  }
}
```
> `bot_token` ו-`password` **לא** כאן — הם Secrets. `chat_id`/נמענים הם ניתוב, לא סוד.

## פריסה (חד-פעמי)
דורש את Firebase CLI ותוכנית **Blaze** (פונקציות דור-2, מתזמן ויציאה לרשת מחייבים זאת;
השימוש בפועל נכנס ב-free tier).

```bash
cd functions
npm install

# 1) מעבר ל-Blaze: Firebase Console → Upgrade (כרטיס אשראי; בלי עלות צפויה)

# 2) הגדרת הסודות (פעם אחת; ערך מודבק כשנשאלים):
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set SMTP_PASS         # רק אם משתמשים במייל
firebase functions:secrets:set NOTIFY_TEST_KEY   # מחרוזת אקראית לבדיקה

# 3) הזנת ההעדפות ב-RTDB תחת /settings/notifications (קונסולה או import)

# 4) פריסה:
firebase deploy --only functions
```

## בדיקה — לקבל התראה אמיתית
אחרי פריסה, פנייה ל-endpoint הבדיקה (מחזיר תוצאה לכל ערוץ ושולח הודעה אמיתית):
```bash
curl "https://europe-west1-ramada-elev.cloudfunctions.net/notifyTest?key=<NOTIFY_TEST_KEY>"
```
> ה-URL המדויק מודפס בסיום `firebase deploy`. בדור-2 ייתכן URL מסוג `*.run.app`.

תשובה תקינה: `{"ok":true,"results":[{"channel":"telegram","ok":true,...}]}` ותקבל הודעה.

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
