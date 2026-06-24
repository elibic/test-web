# Handoff — ECONTROL: דשבורד-על, צי מעליות, והתראות

> מסמך העברת-סשן (חי). בסשן חדש: *"קרא את `docs/admin-dashboard-handoff.md` בריפו ramada-web והמשך מהצעד הבא."*
> עודכן: 2026-06-24. מחליף את `elevator-rpi/docs/admin-dashboard-plan.md` (מיושן).

---

## 🗺️ הארכיטקטורה הכוללת (כפי שהבעלים הגדיר)
מערכת רב-פרויקטית. כל **פרויקט-לקוח** (מלון/אתר) = יחידה עצמאית:
- **פרויקט Firebase משלו** (נפרד לכל לקוח).
- **clone של `ramada-web`** = האתר הציבורי + שכבת התראות בענן (Cloud Functions). משכפלים לכל לקוח חדש.
  דוגמה: מחר "hilton" → clone של ramada-web → פרויקט Firebase חדש `hilton-web`.
- **`elevator-rpi`** רץ על ה-RPi של המעלית (קורא RFID, שולח קומה ל-Firebase). **זהה בכל הפרויקטים** —
  משתנה רק הקונפיג: שם/ID מעלית + הפניה ל-Firebase של אותו פרויקט.

מעל הכל — **`admin-dashboard`** (super-admin על *כל* הפרויקטים): סטטוס חי לכל מעלית, ניהול גרסאות
ועדכון-מרחוק של ה-RPi-ים, וניהול התראות מייל. חי על **פרויקט Firebase מרכזי ("hub")**.

### שלושת הריפו
| ריפו | תפקיד | scope בסשן זה |
|------|-------|---------------|
| `elibic/ramada-web` | תבנית אתר ציבורי פר-פרויקט + Cloud Functions התראות | ✅ |
| `elibic/elevator-rpi` | קוד ה-RPi (RFID→Firebase), זהה לכולם; מכאן עדכוני-צי | ✅ |
| `elibic/admin-dashboard` | דשבורד-על על ה-hub | ❌ **חסום** — צריך להוסיף ל-scope |

---

## ✅ מה הושלם בסשן הזה (2026-06-24)
**`ramada-web` נפרס לפרודקשן (`ramada-elev`) — ירוק מלא.**
- מוזג `claude/practical-curie-sumyjm` → `main`, מה שהביא ל-main: `functions/` (שכבת התראות בענן),
  `apps-script/`, ו-workflow הפריסה `.github/workflows/firebase-deploy.yml`.
- הפריסה דרך GitHub Actions הצליחה אחרי שהבעלים הסדיר בצד Firebase/GCP (תהליך הפעלה-ראשונה):
  הרשאות ל-Service Account (כולל Service Usage Admin + Owner/Project IAM Admin), הרשאות לסוכני-שירות
  (Eventarc/pubsub/compute), הפעלת **Cloud Billing API**, והמתנה להתפשטות Eventarc.
- ה-workflow עודכן להעביר `--force` (cleanup policy אוטומטי של Artifact Registry).
- **חי בפרודקשן:** Hosting + 3 פונקציות ב-`europe-west1`: `onShabbatActiveChange`, `noMovementWatch`,
  `notifyTest`.
- נוסף `functions/DEPLOY_CHECKLIST.md` (כל דרישות ההקמה החד-פעמית — לשכפול הבא, hilton וכו').
- נשמר WIP לא-מחויב בענף: `apps-script/elevator-monitor.gs` — ניטור **רב-בנייני** שקורא `registry/buildings`
  מה-hub (קומיט `c416c8e` בענף `claude/practical-curie-sumyjm`, **לא** ב-main).

**עדיין פתוח בהתראות (זמן-ריצה, לא דפלוי):** להזין `/settings/notifications` ב-RTDB של `ramada-elev`
(`channels.email` עם username/from/to — אותו Gmail של ה-App Password), ולבדוק:
`https://europe-west1-ramada-elev.cloudfunctions.net/notifyTest?key=<NOTIFY_TEST_KEY>` → ציפייה `{"ok":true}` + מייל.

---

## 🎯 הצעד הבא (לסשן עם admin-dashboard ב-scope): שילוב הדשבורד בדף-הנחיתה
לבעלים יש **פרויקט Firebase מרכזי (hub) שכבר מריץ דף-נחיתה בדף הראשי**. רוצה לשלב את הדשבורד לתוכו:
- **`/` = דף הנחיתה (נשאר ראשי)**, **`/dashboard` = הדשבורד** (אתר Hosting אחד; קבצי הדשבורד תחת `public/dashboard/`).

### שאלות פתוחות שצריך לסגור לפני בנייה
1. **התיקייה של דף-הנחיתה** — הבעלים יצרף אותה (לא עלתה עדיין). צריך לראות מבנה.
2. **זהות ה-hub** — האם הנחיתה רצה על **`econtrolelevelev`** (זה ש-`admin-dashboard/public/firebase-config.js`
   כבר מכוון אליו), או פרויקט אחר? אם אחר — לעדכן את ה-config של הדשבורד בהתאם.
3. **RTDB ב-hub** — הדשבורד צריך Realtime Database באותו פרויקט (`/projects`, `/notes`, ובהמשך `registry/buildings`).
   מופעל שם? (ב-`firebase-config.js` של הדשבורד `databaseURL` עדיין ריק — TODO.)
4. **Source-of-truth** — להכניס את הדשבורד *לריפו של הנחיתה*, או את הנחיתה *לתוך `admin-dashboard`*? איך נקרא ריפו הנחיתה (אם קיים)?
5. **אישור מבנה URL** — `/` נחיתה, `/dashboard` דשבורד, `public/dashboard/`.

### רקע על admin-dashboard (מתוך עיון בקוד שהבעלים העלה)
- אתר סטטי. קבצים: `public/index.html` (login·stats·grid·notes·modal), `public/admin-dashboard.js` (~650 ש'),
  `public/firebase-config.js` (hub; `databaseURL` ריק=TODO), `public/install.html`, `public/style.css`.
- `firebase.json` → hosting (public, cleanUrls), `.firebaserc` default `econtrolelevelev`.
- יכולות: Auth (email/Google/דמו `demo@econtrol.co.il`/`demo2026`), `/projects` (לכל פרויקט name·subdomain·
  secret_key·webConfig מלא), גריד שפותח Firebase app **משני** לכל פרויקט וקורא `/elevators`,`/elevator_configs`,`/fleet`,
  כפתורי עדכון-מרחוק שכותבים `/fleet/{id}/command`, פתקים `/notes`, ו-`LATEST_VERSION` קבוע בראש ה-JS.
- ענף ברירת-מחדל של הריפו: `claude/focused-turing-buyt3w`.
- **בשילוב:** index.html של הדשבורד יעבור ל-`/dashboard` (נתיבים יחסיים לקבצים: לוודא ש-style.css/JS/firebase-config
  נטענים נכון מתת-התיקייה); דף הנחיתה נשאר ב-root.

---

## 🔜 אחרי השילוב (לפי סדר הבעלים)
**2) עדכון ה-RPi הקיימים — חלק 2 ב-`elevator-rpi` (עדיין לא נבנה):**
- חסרים `shabbat_detector/fleet_agent.py` + `docs/fleet-remote-update.md`.
- ה-fleet_agent צריך: דיווח גרסה ל-`/fleet/{ELEVATOR_ID}` (`version,last_seen,status` + secret_key, כל ~5 דק'),
  ו-watcher על `/fleet/{ELEVATOR_ID}/command` שמאמת secret → `git pull` + `systemctl restart` → מדווח תוצאה.
- ⚠️ לאשר עם הבעלים את מודל ה-secret_key לעדכון-מרחוק לפני מימוש.

**3) בדיקת התראות:** להזין `/settings/notifications` ולוודא מייל אמיתי (ראה למעלה).

---

## ⚠️ scope / נגישות
- בסשן הזה רק `ramada-web` + `elevator-rpi` היו ב-scope. `admin-dashboard` נחסם ("not configured for this session").
- הדפלוי בוצע דרך **git push ל-main** + טריגר-push של ה-workflow. הערה: ל-GitHub MCP אין `actions: write`
  (workflow_dispatch מחזיר 403) — מפעילים פריסה ע"י push ל-main שנוגע ב-`functions/`/`public/`/workflow.
- לסשן הבא: לכלול בסביבה את **שלושת הריפו** (admin-dashboard + ramada-web + elevator-rpi), ולצרף את תיקיית דף-הנחיתה.

## טקסט-פתיחה לסשן הבא (להדבקה)
> קרא את `docs/admin-dashboard-handoff.md` בריפו `ramada-web`. ודא ששלושת הריפו ב-scope
> (admin-dashboard + ramada-web + elevator-rpi). המשימה הבאה: לשלב את `admin-dashboard` לתוך פרויקט
> ה-hub שכבר מריץ דף-נחיתה — הנחיתה נשארת ב-`/`, הדשבורד ב-`/dashboard`. אני מצרף את תיקיית דף-הנחיתה.
> לפני בנייה, סגור את 5 השאלות הפתוחות שבמסמך (זהות ה-hub, RTDB, source-of-truth, מבנה URL).
