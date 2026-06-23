# Handoff — דשבורד-העל (admin-dashboard / ECONTROL)

> מסמך העברת-סשן. בסשן חדש: *"קרא את `docs/admin-dashboard-handoff.md` בריפו ramada-web והמשך מהצעד הבא."*
> מעדכן ומחליף את `elevator-rpi/docs/admin-dashboard-plan.md` (שעדיין כתוב "תכנון בלבד" — **מיושן**: חלק 1 כבר נבנה).
> תאריך עדכון: 2026-06-23.

---

## TL;DR — איפה אנחנו עומדים
| חלק | מה זה | סטטוס |
|-----|-------|-------|
| **1. הדשבורד** | ריפו `elibic/admin-dashboard` — אתר סטטי, Firebase Hosting | ✅ **בנוי** (ענף `claude/focused-turing-buyt3w`) |
| **2. צד ה-Pi** | דיווח-גרסה + ביצוע פקודת-עדכון ב-`elevator-rpi` | ❌ **לא קיים** — זה הצעד הבא |
| **3. ramada-web** | אימות נתיב `/setup` + מבנה config פר-פרויקט | ⏳ קל; הריפו עכשיו ב-scope |

**הבעיה המרכזית:** הדשבורד כותב פקודות עדכון ל-`/fleet/{id}/command`, ומציג עמודות "גרסה/מקוון"
לפי `/fleet/{id}` — אבל **ה-Pi עוד לא כותב לשם כלום ולא קורא משם כלום**. חלק 2 הוא מה שסוגר את הלולאה.

---

## ⚠️ מצב גישה (קריטי לסשן הבא)
- ה-scope של הסשן שבו זה נכתב היה מוגבל ל-`elibic/elevator-rpi` + `elibic/ramada-web` בלבד.
- **`elibic/admin-dashboard` היה חסום** ("not configured for this session") — אפשר לראות אותו בחיפוש,
  אבל **לא לקרוא/לכתוב/לדחוף**. הקוד שלו הובן דרך עותק ZIP/RAR שהמשתמש העלה.
- **לפני שמתחילים לעבוד על הדשבורד עצמו:** לוודא ש-`elibic/admin-dashboard` נמצא ב-scope של הסשן החדש
  (Edit environment / New session עם כל שלושת הריפו: admin-dashboard + elevator-rpi + ramada-web).
- את חלק 2 (להלן) אפשר לבצע גם בלי זה — הוא כולו בתוך `elevator-rpi` (כבר ב-scope).

---

## מה כבר בנוי — `admin-dashboard` (חלק 1)
ריפו `elibic/admin-dashboard`, ענף ברירת-מחדל `claude/focused-turing-buyt3w`. אתר סטטי,
Firebase Hosting על פרויקט האדמין **`econtrolelevelev`** (`.firebaserc` default).

**קבצים (`public/`):**
- `index.html` — שלד: login · stats · grid · פתקים · מודאל הוספה/עריכה. טוען Firebase compat SDK 10.12.2.
- `admin-dashboard.js` (~650 שורות) — כל הלוגיקה: Auth, מצב דמו, `/projects`, `/notes`, stats,
  פתיחת Firebase app **משני** לכל פרויקט, פקודות עדכון.
- `firebase-config.js` — אתחול פרויקט האדמין. **`databaseURL` ריק (TODO)** — בלעדיו רק דמו/Auth עובדים.
- `install.html` — מדריך התקנת RPi עצמאי (מבוסס README של elevator-rpi).
- `style.css` — עיצוב כהה RTL.
- `firebase.json` (hosting: public, cleanUrls, מתעלם מ-CLAUDE.md) · `.firebaserc` (default: econtrolelevelev).

**יכולות שכבר עובדות:**
- **Auth**: email/password + Google + **מצב דמו** (`demo@econtrol.co.il` / `demo2026`, או "צפה בדמו ›") —
  הדמו מזריק 3 פרויקטים (ramada/nitza20/wolfson) ולא נוגע ב-Firebase.
- **`/projects`** (ב-DB האדמין): לכל פרויקט `name`, `subdomain`, `secret_key`, `webConfig` מלא, `createdAt`.
- **גריד חי**: לכל פרויקט נפתח Firebase app משני מה-`webConfig` שלו, מאזין ל-`/elevators`,
  `/elevator_configs`, `/fleet` → קומה · שבת/חול (`SHABBAT_ACTIVE`) · online/offline · גרסה מול `LATEST_VERSION`.
- **עדכון מרחוק** ב-3 רמות: מעלית בודדת · "עדכן הכל" (פר-פרויקט) · "עדכן את כל הצי" —
  כותב `/fleet/{eid}/command = {action:"update", secret_key, requested_at}`.
- **עריכה** (`✏️`): שינוי שם/subdomain/secret/config → `update` ל-`/projects/{id}`.
- **פתקים** (`/notes`): קישורים/הערות, סניטציה ל-http(s) בלבד.
- **`LATEST_VERSION`** קבוע בראש `admin-dashboard.js` (כרגע `"2026.06.21"`) = מקור-אמת לגרסה העדכנית.

**TODO פתוחים בצד הדשבורד (הגדרת Firebase, לא קוד):**
1. להפעיל **Realtime Database** בפרויקט `econtrolelevelev` ולמלא `databaseURL` ב-`firebase-config.js`
   (כרגע `""` → באנר "DB לא מוגדר", רישום פרויקטים לא נטען).
2. **Authentication → Sign-in method**: להפעיל Email/Password ו/או Google; להוסיף משתמש בעלים;
   לוודא דומיין מורשה (Authorized domains).
3. **חוקי-RTDB של האדמין**: `/projects` ו-`/notes` → `.read/.write` רק `auth != null` (מכילים secret_keys!).
4. פריסה: `firebase deploy --only hosting -P econtrolelevelev` (לבמפ `?v=YYYYMMDD` ב-HTML אחרי שינוי CSS/JS).

---

## מה לא קיים — חלק 2: צד ה-Pi ב-`elevator-rpi` ← **הצעד הבא**
חסרים שני קבצים שמוזכרים בכל התיעוד אך **לא קיימים בריפו**:
- `shabbat_detector/fleet_agent.py` — הסוכן שמדווח גרסה וקורא פקודות.
- `docs/fleet-remote-update.md` — תיעוד המודל + חוקי-RTDB פר-פרויקט.

**מה ה-fleet_agent צריך לעשות** (לפי `admin-dashboard-plan.md` §2, מתבסס על המודל הקיים ב-`firebase_client.py`):
1. **דיווח גרסה** — בהפעלה + כל ~5 דק': `PATCH /fleet/{ELEVATOR_ID}` עם
   `{version: <git sha/tag>, last_seen: <epoch>, status: "online"}` + `secret_key` מהקונפיג.
   (הדשבורד משווה `version` ל-`LATEST_VERSION`; `last_seen` מזין online/offline — סף `REPORT_STALE_SECONDS=660`.)
2. **watcher לפקודות** — stream/poll על `/fleet/{ELEVATOR_ID}/command`; כשמגיע
   `{action:"update", secret_key, requested_at}` → **לאמת `secret_key`** מול הקונפיג → `git pull` +
   `systemctl restart shabbat-detector` (ואולי `rfid-tracker`) → לדווח תוצאה חזרה ל-`/fleet/{id}`
   (למשל `update_status: "ok"|"failed: <reason>"` — הדשבורד כבר יודע להציג `update_status`).
3. **אבטחה**: ה-Pi מריץ קוד לפי טריגר מרוחק → חובה לאמת `secret_key` לפני כל פעולה (זהה למודל ה-PATCH הקיים).
4. **אינטגרציה**: שירות systemd נפרד או הרחבה ל-`shabbat-detector`; להוסיף ל-`setup.sh`.
   `ELEVATOR_ID` + `secret_key` + `FIREBASE_URL` כבר בקונפיג (`rfid_config.json`).

> ⚠️ פתוח לאישור: המודל הזה ("Pi מריץ git pull לפי פקודה מרחוק, מאומת ב-secret_key") טרם אושר סופית
> ע"י המשתמש לפני בנייה. **לוודא אישור לפני מימוש.**

---

## חלק 3 — `ramada-web` (קל, עכשיו ב-scope)
- לאמת את הנתיב המדויק של דף ההגדרות (`/setup`) שאליו הדשבורד מקשר (`https://<subdomain>.econtrol.co.il/setup`).
- לאמת את מבנה ה-Firebase web config פר-פרויקט (התבנית שממנה משכפלים אתרי לקוח).
- מקור-אמת למודל הנתונים: `ramada-web/public/setup.html`.

---

## החלטות פתוחות / אי-עקביות לתעד
- **שם הריפו**: התוכנית קוראת לו `ramada-admin`; בפועל נוצר בשם **`admin-dashboard`**. (אותו דבר.)
- **התראות**: התוכנית (§התראות) מציעה להעביר ניהול התראות לדשבורד. אבל `elevator-rpi/CLAUDE.md` מציין
  שההתראות **כבר עברו ל-Cloud Functions ב-`ramada-web/functions/`** (ו-`notifier.py` מושבת בפרודקשן).
  כלומר השליחה כבר בענן; מה שחסר זה אולי רק **ניהול ההגדרות** מהדשבורד. **להבהיר עם המשתמש מה היעד.**
- **`LATEST_VERSION`**: כרגע מעודכן ידנית ב-`admin-dashboard.js`. לזכור לעדכן בכל שחרור של elevator-rpi.

## הצעד הבא (סדר מומלץ)
1. לוודא scope: admin-dashboard + elevator-rpi + ramada-web בסשן.
2. לקבל אישור על מודל ה-secret_key לעדכון מרחוק.
3. **לבנות חלק 2** ב-`elevator-rpi`: `fleet_agent.py` + `docs/fleet-remote-update.md` + שילוב ב-`setup.sh`.
4. למלא TODO-ים בצד הדשבורד (RTDB + Auth + rules + databaseURL) ולפרוס.
5. לאמת מקצה-לקצה: Pi מדווח גרסה → מופיע בדשבורד → "עדכן" → Pi מבצע git pull → מדווח תוצאה.

---

## טקסט-פתיחה מוכן לסשן הבא (להדבקה)
> קרא את `docs/admin-dashboard-handoff.md` בריפו `ramada-web`. ודא ששלושת הריפו ב-scope
> (admin-dashboard + elevator-rpi + ramada-web). נמשיך מחלק 2 — בניית
> `shabbat_detector/fleet_agent.py` ו-`docs/fleet-remote-update.md` ב-`elevator-rpi`.
> לפני מימוש, אשר איתי את מודל ה-secret_key לעדכון מרחוק.
