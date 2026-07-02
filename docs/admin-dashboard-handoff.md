> ⚠️ **מיושן / עותק.** מקור-האמת עבר למונו-רפו בריפו **ramada-web** (`docs/` ו-`monorepo/`).
> ראה `ramada-web/docs/SETUP-NEW-PROJECT.md`. הריפו הזה פורש מפריסת hosting (יולי 2026).

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
| `elibic/admin-dashboard` | דשבורד-על על ה-hub | ✅ |

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

## ✅ הושלם (2026-06-24, סשן שני): שילוב הדשבורד בדף-הנחיתה (hub)
לבעלים יש **פרויקט Firebase מרכזי (hub) שמריץ דף-נחיתה בדף הראשי**. הדשבורד שולב לתוכו:
- **`/` = דף הנחיתה (ראשי)**, **`/admin` = הדשבורד** (אתר Hosting אחד; קבצי הדשבורד תחת `public/admin/`).

### החלטות שנסגרו לפני הבנייה (5 השאלות) — ✅
1. **תיקיית הנחיתה** — צורפה. אתר סטטי (`public:"."`, cleanUrls); קובץ הפרודקשן `index.html`
   ("מעלית שבת אצלכם בסלון | ECONTROL") + `404.html` + `icon-512.png` + הרבה גיבויים/טיוטות.
2. **זהות ה-hub** — ה-`.firebaserc` של הנחיתה = **`econtrolelevelev`** = בדיוק הפרויקט שהדשבורד מכוון אליו. אותו hub.
3. **RTDB ב-hub** — מופעל (אזור EU). מולא `databaseURL` =
   `https://econtrolelevelev-default-rtdb.europe-west1.firebasedatabase.app`.
4. **Source-of-truth** — הנחיתה הוכנסה **לתוך `admin-dashboard`** (הגיעה כתיקייה בלבד, ללא ריפו משלה).
5. **מבנה URL** — `/` נחיתה · **`/admin`** דשבורד (הבעלים בחר `/admin`, לא `/dashboard`).

### מה נבנה (קומיט בענף `claude/gracious-goldberg-46vlsy` של `admin-dashboard`)
- הדשבורד עבר ל-`public/admin/` (git mv); דף הנחיתה תחת `public/`. `firebase.json` → `public:"public"`, cleanUrls.
- נתיבי-הקבצים של הדשבורד הומרו למוחלטים `/admin/...` (עמיד ל-trailing-slash) ו-`?v=20260624`.
- `databaseURL` הושלם; `README` + `public/admin/CLAUDE.md` עודכנו. נבדק מקומית: `/`=נחיתה, `/admin/`=דשבורד, כל הנכסים 200.
- הנחיתה הוכנסה as-is (כולל גיבויים/כפילויות, לפי בקשת הבעלים); `.gstack/`+`.firebase/` (runtime/סוד) לא נוספו.
- **נותר לבעלים (זמן-ריצה):** פריסה (`firebase deploy --only hosting -P econtrolelevelev`), ולוודא RTDB+Auth מופעלים בקונסול.

### רקע על admin-dashboard (מתוך עיון בקוד שהבעלים העלה)
- אתר סטטי. קבצים: `public/index.html` (login·stats·grid·notes·modal), `public/admin-dashboard.js` (~650 ש'),
  `public/firebase-config.js` (hub; `databaseURL` ריק=TODO), `public/install.html`, `public/style.css`.
- `firebase.json` → hosting (public, cleanUrls), `.firebaserc` default `econtrolelevelev`.
- יכולות: Auth (email/Google/דמו `demo@econtrol.co.il`/`demo2026`), `/projects` (לכל פרויקט name·subdomain·
  secret_key·webConfig מלא), גריד שפותח Firebase app **משני** לכל פרויקט וקורא `/elevators`,`/elevator_configs`,`/fleet`,
  כפתורי עדכון-מרחוק שכותבים `/fleet/{id}/command`, פתקים `/notes`, ו-`LATEST_VERSION` קבוע בראש ה-JS.
- ענף ברירת-מחדל של הריפו: `claude/focused-turing-buyt3w`.
- **בשילוב (בוצע):** קבצי הדשבורד עברו ל-`public/admin/` (מוגש ב-`/admin`); נתיבי הקבצים הומרו למוחלטים
  `/admin/...` כדי שייטענו נכון מתת-התיקייה; דף הנחיתה נשאר ב-root.

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
- בסשן זה (השני) **שלושת הריפו** ב-scope (admin-dashboard + ramada-web + elevator-rpi). בסשן הראשון `admin-dashboard` נחסם.
- כל הפיתוח בסשן זה בענף `claude/gracious-goldberg-46vlsy` (בכל שלושת הריפו).
- הדפלוי בוצע דרך **git push ל-main** + טריגר-push של ה-workflow. הערה: ל-GitHub MCP אין `actions: write`
  (workflow_dispatch מחזיר 403) — מפעילים פריסה ע"י push ל-main שנוגע ב-`functions/`/`public/`/workflow.
- לסשן הבא: לכלול בסביבה את **שלושת הריפו** (admin-dashboard + ramada-web + elevator-rpi), ולצרף את תיקיית דף-הנחיתה.

## טקסט-פתיחה לסשן הבא (להדבקה)
> קרא את `docs/admin-dashboard-handoff.md` בריפו `ramada-web`. שילוב ה-hub (נחיתה `/` + דשבורד `/admin`)
> **הושלם** ונדחף ל-`admin-dashboard` (ענף `claude/gracious-goldberg-46vlsy`). המשימה הבאה: **חלק 2 — צד ה-RPi**
> ב-`elevator-rpi`: `shabbat_detector/fleet_agent.py` (דיווח גרסה ל-`/fleet/{id}` + watcher על `/fleet/{id}/command`)
> + `docs/fleet-remote-update.md`. ⚠️ לאשר עם הבעלים את מודל ה-secret_key לעדכון-מרחוק לפני מימוש.
