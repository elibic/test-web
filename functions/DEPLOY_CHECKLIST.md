# Deploy checklist — functions (ramada-elev)

פריסת שכבת ההתראות "תמיד-חיה" (Cloud Functions) ל-`ramada-elev`. הפריסה רצה
אוטומטית ב-push ל-`main` שנוגע ב-`functions/`/`public/` (workflow: `.github/workflows/firebase-deploy.yml`).

## הקמה חד-פעמית (כל אלה צריכים להיות מוכנים לפני פריסה מוצלחת)

### 1. תוכנית Blaze
פרויקט `ramada-elev` חייב להיות על **Blaze** — Cloud Functions לא נפרסות ב-Spark.

### 2. הרשאות ל-Service Account (זה שב-secret `FIREBASE_SERVICE_ACCOUNT`)
ב-Google Cloud Console → IAM, על ה-SA (`client_email` מתוך ה-JSON), הענק:
- **Service Usage Admin** ← בלעדיו: `403 Permission denied to get service cloudfunctions.googleapis.com`
- **Cloud Functions Admin**
- **Service Account User**
- **Secret Manager Admin** (לסודות הפונקציות)
- **Cloud Build Editor** + **Artifact Registry Administrator** (build דור-2)
- **Owner** או **Project IAM Admin** ← בלעדיו: `We failed to modify the IAM policy` (Firebase לא יכול להעניק לסוכני-השירות את התפקידים שלהם)
- (אופציונלי כגיבוי רחב: **Editor**)

### 3. הפעלת APIs בפרויקט
`cloudbilling` ← בלעדיו: `403 Cloud Billing API has not been used... or it is disabled`.
וגם: `cloudfunctions`, `cloudbuild`, `artifactregistry`, `run`, `eventarc`, `pubsub`, `cloudscheduler`, `secretmanager`.
(Firebase מפעיל את רובם אוטומטית אם ל-SA יש Service Usage Admin — חוץ מ-cloudbilling, שכדאי להפעיל ידנית.)

### 4. Function Secrets (Secret Manager — שמות מדויקים)
הפונקציות מצהירות עליהם ב-`index.js`; חייבים להתקיים אחרת הפריסה ב-`--non-interactive` נכשלת:
- **`SMTP_PASS`** — App Password של Gmail (16 תווים, ללא רווחים). דורש 2-Step Verification מופעל.
- **`NOTIFY_TEST_KEY`** — מחרוזת אקראית להגנת endpoint הבדיקה.
- `TELEGRAM_BOT_TOKEN` — רק כשמפעילים טלגרם (כרגע מושבת ב-`index.js`).

### 5. הרשאות לסוכני-שירות (gen-2) — חד-פעמי
אם ה-SA אינו Owner/Project IAM Admin, הרץ ב-Cloud Shell פעם אחת (הערכים מודפסים בלוג הכושל):
```bash
gcloud projects add-iam-policy-binding ramada-elev --member=serviceAccount:service-<PROJ_NUM>@gcp-sa-pubsub.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator
gcloud projects add-iam-policy-binding ramada-elev --member=serviceAccount:<PROJ_NUM>-compute@developer.gserviceaccount.com --role=roles/run.invoker
gcloud projects add-iam-policy-binding ramada-elev --member=serviceAccount:<PROJ_NUM>-compute@developer.gserviceaccount.com --role=roles/eventarc.eventReceiver
```

### 6. אימות ל-CI (GitHub → Settings → Secrets and variables → Actions)
- **`FIREBASE_SERVICE_ACCOUNT`** (מומלץ): JSON של Service Account. ה-workflow מעדיף אותו אם קיים.
- או **`FIREBASE_TOKEN`**: פלט `firebase login:ci`. ⚠️ אם `FIREBASE_SERVICE_ACCOUNT` קיים — הוא גובר; כדי להשתמש בטוקן יש למחוק את ה-SA.

## זמן-ריצה (לא חוסם פריסה, אך נדרש כדי שמיילים יישלחו)
`/settings/notifications` ב-RTDB עם `channels.email.enabled=true` (מבנה מלא ב-`functions/README.md`).

## בדיקה אחרי פריסה ירוקה
```
curl "https://europe-west1-ramada-elev.cloudfunctions.net/notifyTest?key=<NOTIFY_TEST_KEY>"
```
תקין: `{"ok":true,...}` + מתקבל מייל.
