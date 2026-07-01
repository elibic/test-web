# התקנת בניין חדש - מדריך שלב-אחרי-שלב (מקצה לקצה)

מדריך יחיד ומלא לשכפול מערכת מעלית-שבת לבניין/מלון חדש. עוקבים לפי הסדר, מלמעלה למטה.
כל טקסט במקף רגיל `-` בלבד.

**מקרא:**  🤖 = אוטומטי (סקריפט/CI)  ·  ✋ = ידני (עם קישור)  ·  ⏱️ = חד-פעמי למחשב שלך

לאורך המדריך החלף:
- `PROJECT_ID` = מזהה הפרויקט ב-Firebase (למשל `ramada-elev`).
- `OWNER/REPO` = הריפו ב-GitHub (למשל `elibic/ramada-web`).

> טיפ: אחרי שתסיים פעם אחת, השכפול הבא לוקח ~15 דקות. רוב הזמן הוא המתנה להפעלת שירותי-ענן.

---

## מפת הדרך (מה אוטומטי ומה ידני)

| # | שלב | מי עושה |
|---|------|---------|
| 0 | התקנת כלים על המחשב שלך (chד-פעמי) | ✋ ⏱️ |
| 1 | יצירת פרויקט Firebase + Blaze + Auth + DB + Storage | ✋ (קונסול) |
| 2 | ריפו GitHub מהתבנית + עריכת `firebase-config.js` | ✋ |
| 3 | הפעלת APIs + הרשאות IAM + משיכת config + פריסה | 🤖 (סקריפט) |
| 4 | secret של ה-CI ב-GitHub | 🤖 (בסקריפט) או ✋ |
| 5 | פריסת פונקציית `extractTheme` (חילוץ-מאתר) | 🤖 (בסקריפט/CI) |
| 6 | כללי-אבטחה ל-RTDB | ✋ (העתקה מהדגל) |
| 7 | הגדרות מראה/מעליות/משתמשים דרך ה-UI | ✋ (setup.html/admin.html) |
| 8 | רישום הבניין בדשבורד-הצי | ✋ (טופס) |
| 9 | התראות | ✋ (דשבורד + Apps Script) |
| 10 | התקנת ה-Raspberry Pi לכל מעלית | ✋ (`setup.sh`) |

---

## שלב 0 - כלים על המחשב שלך  ✋ ⏱️ (חד-פעמי לכל החיים)

התקן והתחבר פעם אחת:

| כלי | התקנה | התחברות |
|-----|--------|----------|
| Node.js (18+) | https://nodejs.org | - |
| Firebase CLI | `npm i -g firebase-tools` · https://firebase.google.com/docs/cli | `firebase login` |
| Google Cloud SDK (`gcloud`) | https://cloud.google.com/sdk/docs/install | `gcloud auth login` |
| GitHub CLI (`gh`, אופציונלי) | https://cli.github.com | `gh auth login` |

> חייבים להיות **Owner** של פרויקט ה-Firebase כדי שההרשאות והפריסה יעבדו.

---

## שלב 1 - פרויקט Firebase  ✋ (קונסול, ~5 דק')

1. **צור פרויקט:** https://console.firebase.google.com/ -> "Add project". רשום את ה-`PROJECT_ID`.
2. **הפעל Blaze (חובה ל-Cloud Functions):** בפרויקט -> ⚙️ -> Usage and billing -> Modify plan -> **Blaze**.
   קישור ישיר: `https://console.firebase.google.com/project/PROJECT_ID/usage`
3. **Authentication:** `https://console.firebase.google.com/project/PROJECT_ID/authentication/providers`
   -> הפעל **Email/Password** ו-**Google**.
4. **Realtime Database:** `https://console.firebase.google.com/project/PROJECT_ID/database`
   -> Create Database -> אזור **europe-west1** (EU) -> התחל ב-locked mode (כללים נגדיר בשלב 6).
5. **Storage:** `https://console.firebase.google.com/project/PROJECT_ID/storage` -> Get started.
6. **אפליקציית Web** (מקור ה-firebaseConfig): ⚙️ -> Project settings -> Your apps -> Web (`</>`).
   קישור: `https://console.firebase.google.com/project/PROJECT_ID/settings/general`
   (אפשר גם דרך הסקריפט: `firebase apps:create WEB "<שם>" --project PROJECT_ID`.)

---

## שלב 2 - קוד: ריפו מהתבנית + firebase-config.js  ✋

1. **צור ריפו חדש מהתבנית** (`ramada-web` היא תבנית-הדגל; `test-web` היא ה-sandbox):
   - ב-GitHub: Use this template / Fork, או clone + push לריפו חדש `OWNER/REPO`.
2. **ערוך רק את `public/firebase-config.js`:**
   - `firebaseConfig` = פרטי הפרויקט החדש (apiKey / authDomain / databaseURL / projectId / storageBucket / messagingSenderId / appId). ⭐ **את הבלוק הזה מושכים אוטומטית בשלב 3** ומדביקים כאן.
   - `appConfig.theme` = ברירת-מחדל סינכרונית (אנטי-FOUC) - כוונן לערכה הרצויה או השאר `ramada-gold`.
   - `appConfig.branding` (לוגו/favicon/poweredBy/themeColor), `appConfig.texts`, `appConfig.elevatorNames` - ברירות-מחדל; ניתן לדרוס בזמן-ריצה דרך setup.html.
3. `.firebaserc` - הסקריפט יעדכן אוטומטית (`firebase use`). אפשר גם ידנית: `{"projects":{"default":"PROJECT_ID"}}`.

---

## שלב 3 - אוטומציה: APIs + IAM + config + פריסה  🤖

מתוך שורש הריפו, על המחשב שלך:

```bash
./scripts/setup-firebase.sh PROJECT_ID --github-secret OWNER/REPO
```

הסקריפט (`scripts/setup-firebase.sh`) עושה הכל:
- מגדיר פרויקט פעיל (gcloud + firebase).
- מפעיל את כל ה-APIs (cloudfunctions, cloudbuild, artifactregistry, run, eventarc, pubsub, storage).
- נותן ל-Service Account של ה-CI את **4 התפקידים**: Editor + Service Account User + **Cloud Functions Admin** + Cloud Run Admin.
- מדפיס את **firebaseConfig** (העתק אותו ל-`public/firebase-config.js` -> שלב 2 -> commit + push).
- פורס **hosting + storage + functions:extractTheme**.
- (עם `--github-secret`) יוצר מפתח ל-SA, מעלה אותו כ-secret `FIREBASE_SERVICE_ACCOUNT` ב-GitHub, ומוחק מקומית.

> ⚠️ אם הסקריפט נופל על **billing** - Blaze עוד לא פעיל (שלב 1.2). הפעל והרץ שוב.
> ⚠️ ה-SA המשוער הוא `firebase-adminsdk-fbsvc@PROJECT_ID.iam.gserviceaccount.com`. אם שמו שונה, הוסף `--sa <email>`.

**מה זה מחליף (הכאב שהיה בהתקנה הראשונה):** בלי הסקריפט, הפריסה של הפונקציה נכשלת שוב ושוב על הרשאות
חסרות. פירוט מלא של *למה* צריך כל תפקיד: `docs/HANDOFF.md`.

---

## שלב 4 - secret של ה-CI ב-GitHub  🤖/✋

- 🤖 אם הרצת עם `--github-secret OWNER/REPO` - **בוצע**, דלג.
- ✋ ידנית: `https://github.com/OWNER/REPO/settings/secrets/actions` -> New repository secret ->
  שם `FIREBASE_SERVICE_ACCOUNT`, ערך = תוכן ה-JSON של מפתח ה-SA.
  יצירת מפתח: `gcloud iam service-accounts keys create key.json --iam-account=firebase-adminsdk-fbsvc@PROJECT_ID.iam.gserviceaccount.com` (ואז הדבק את תוכן `key.json`, ומחק אותו).

מרגע זה: **push ל-main** פורס אוטומטית **hosting**. פונקציות = ידני (שלב 5).

---

## שלב 5 - פונקציית extractTheme (חילוץ ערכה מאתר)  🤖

- 🤖 אם הרצת את הסקריפט (שלב 3) - הפונקציה כבר פרוסה.
- לפריסה חוזרת/ידנית: GitHub -> Actions -> "Deploy to Firebase" -> **Run workflow** -> branch `main`
  -> "מה לפרוס" = **`functions:extractTheme`** (לא `functions,hosting`!) -> Run.
  קישור: `https://github.com/OWNER/REPO/actions`
- דרישות: Blaze + 4 תפקידי ה-IAM (שלב 3). `functions/index.js` מכיל **רק extractTheme** (בלי סודות) בכוונה - אחרת ה-CLI נופל על Secret Manager (ראה HANDOFF).

---

## שלב 6 - כללי-אבטחה ל-RTDB  ✋ (חשוב, במיוחד ל-INDEX מוגבל)

שער-הלקוח לבדו **אינו** אבטחה. אם ה-INDEX מוגבל - חובה כללי-RTDB.

**הדרך הבטוחה: העתקה מפרויקט-הדגל.**
1. בדגל (ramada): `https://console.firebase.google.com/project/<flagship>/database` -> Rules -> העתק הכל.
2. בפרויקט החדש: `https://console.firebase.google.com/project/PROJECT_ID/database` -> Rules -> הדבק -> **Publish**.

הכללים חייבים לאפשר: קריאה ציבורית לנתוני-התצוגה (`elevators`, `elevator_configs`, `settings`),
כתיבת ה-Pi ל-`elevators/{id}` (מאומתת ב-`secret_key` בגוף), וקריאת צומת-התפקיד של משתמש מאומת
(`super_admins`/`allowed_users`/`allowed_viewers`) לשער ה-INDEX.

> Storage rules כבר בריפו (`storage.rules`) ונפרסו ע"י הסקריפט - אין מה לעשות ידנית.
> שיפור עתידי (טרם מומש): לגרסת-קוד את כללי-ה-RTDB לקובץ `database.rules.json` - ראה `docs/replication-automation-plan.md`.

---

## שלב 7 - הגדרות דרך ה-UI  ✋ (בלי קוד)

1. **מראה ומיתוג:** `https://PROJECT_ID.web.app/setup.html` -> "מראה ומיתוג":
   ערכת-נושא (צבעים/גופן, כולל HEX / חילוץ מ-PDF/תמונה / **חילוץ מאתר** - עובד אחרי שלב 5),
   לוגו, QR ב-PUBLIC (הצגה + טקסטים), וגישת INDEX (open / רמת-מינימום).
2. **מעליות וקומות:** setup.html -> מעליות / הגדרות מערכת.
3. **משתמשים:** `https://PROJECT_ID.web.app/admin.html` -> super_admins / allowed_users / allowed_viewers
   (נדרש לגישת INDEX מוגבלת).

---

## שלב 8 - רישום הבניין בדשבורד-הצי  ✋

בדשבורד האדמין (`admin-dashboard`, ה-hosting של פרויקט האדמין):
1. התחבר -> **"+ הוסף פרויקט"**.
2. מלא: **שם** (name), **subdomain** (קוד הבניין), **secret_key** (זהה ל-SECRET_KEY של ה-Pi),
   ו-**Firebase web config** (הדבק את `firebaseConfig` של הפרויקט החדש; חובה `databaseURL` + `projectId`).
3. שמירה. (נכתב ל-RTDB של האדמין תחת `/projects/{id}`.)

---

## שלב 9 - התראות  ✋

מנוהלות **מרכזית** מהדשבורד (סקשן **"🔔 התראות"** לכל פרויקט) ונשלחות ע"י Google Apps Script
(`admin-dashboard/apps-script`) על בסיס המצב שה-Pi כותב ל-Firebase. **אין** להריץ שכבת-פונקציות
מקבילה (התראות כפולות). אין הגדרה בקוד הווב.

---

## שלב 10 - Raspberry Pi לכל מעלית  ✋

על ה-Pi:
```bash
git clone https://github.com/elibic/elevator-rpi.git ~/elevator-RFID
cd ~/elevator-RFID
sudo ./setup.sh --web      # אשף גרפי (או: sudo ./setup.sh לאשף טרמינל)
```
מלא ב-`rfid_config.json` (או דרך האשף):
- `ELEVATOR_ID` - מזהה ייחודי למעלית (למשל `"A"`).
- `SECRET_KEY` - **זהה ל-secret_key שרשמת בדשבורד** (שלב 8).
- `FIREBASE_URL` - `https://PROJECT_ID-default-rtdb.europe-west1.firebasedatabase.app/elevators.json`.
- `tags` - מיפוי תגית-RFID (hex) -> קומה.
- (אופציונלי) שדות fleet ו-log-backup.

ה-Pi כותב ל-Firebase ב-PATCH עם `secret_key` בגוף (מעל HTTPS). הקובץ `rfid_config.json` מוחרג
מ-Git - לעולם אל תעלה אותו.

---

## צ'ק-ליסט מהיר (להדפסה)

```
[ ] 0. כלים: node, firebase-tools, gcloud, (gh) - מותקנים ומחוברים
[ ] 1. Firebase: פרויקט + Blaze + Auth(Email+Google) + RTDB(EU) + Storage + Web app
[ ] 2. ריפו מהתבנית + firebase-config.js (ימולא בשלב 3)
[ ] 3. ./scripts/setup-firebase.sh PROJECT_ID --github-secret OWNER/REPO
[ ] 3b. הדבקת firebaseConfig שהודפס -> public/firebase-config.js -> commit+push
[ ] 4. secret FIREBASE_SERVICE_ACCOUNT ב-GitHub (או ע"י הסקריפט)
[ ] 5. extractTheme פרוסה (סקריפט/Run workflow target=functions:extractTheme)
[ ] 6. כללי RTDB הועתקו מהדגל -> Publish
[ ] 7. setup.html: מראה + מעליות ; admin.html: משתמשים
[ ] 8. רישום בדשבורד (name/subdomain/secret_key/webConfig)
[ ] 9. התראות בדשבורד (🔔)
[ ] 10. לכל מעלית: Pi -> setup.sh -> ELEVATOR_ID/SECRET_KEY/FIREBASE_URL/tags
```

---

## מסמכים קשורים
- `docs/HANDOFF.md` - מצב הפרויקט + *למה* צריך כל תפקיד IAM (רצף-האבחון של הפריסה).
- `docs/REPLICATION.md` - צ'ק-ליסט השכפול המקורי + מודל `settings/appearance`.
- `docs/replication-automation-plan.md` - תוכנית (עתידית) לשכפול-דאטה אוטומטי מלא (settings/rules/nodes + איפוסים).
