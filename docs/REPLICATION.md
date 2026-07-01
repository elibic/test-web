# שכפול פרויקט מעלית-שבת לבניין חדש

תבנית-הדגל היא ramada-web. כל ההתאמות-לפרויקט מנוהלות מ-UI (`setup.html` -> "מראה ומיתוג"),
כך שאין צורך לערוך קוד מלבד פרטי-ההתחברות ל-Firebase.

## צ'ק-ליסט
1. **Firebase project חדש**: צור פרויקט, הפעל Authentication (Email/Password + Google),
   Realtime Database (אזור EU מומלץ), Storage, ו-Hosting.
2. **קוד**: העתק את `public/` (+ `firebase.json`, `.firebaserc`) מהתבנית. ערוך **רק** את
   `public/firebase-config.js`:
   - בלוק `firebaseConfig` = פרטי הפרויקט החדש (apiKey / databaseURL / projectId / storageBucket / ...).
   - `appConfig.theme` = ברירת-מחדל סינכרונית (אנטי-FOUC); כוונן לערכה הרצויה (או השאר ramada-gold).
   - שאר `appConfig` (לוגו / טקסטים / שמות-מעליות) = ברירות-מחדל; ניתן לדרוס בזמן-ריצה דרך setup.
3. **פריסה**: `firebase deploy --only hosting -P <projectId>` (או הוסף GitHub Action כמו ב-ramada).
4. **הגדרת מראה** (`setup.html` -> "מראה ומיתוג"): ערכת-נושא (צבעים / גופן), לוגו (URL),
   QR ב-PUBLIC (הצגה + טקסטים), וגישת INDEX (open / רמת-מינימום).
5. **מעליות וקומות**: `setup.html` -> מעליות / הגדרות מערכת.
6. **משתמשים**: `admin.html` -> super_admins / allowed_users / allowed_viewers (נדרש לגישת INDEX מוגבלת).
7. **דשבורד-צי**: רשום את הפרויקט ב-admin-dashboard (name / subdomain / secret_key / webConfig) לניטור ועדכון-מרחוק.
8. **אם INDEX מוגבל - חובה RTDB Security Rules** (שער-הלקוח לבדו אינו אבטחה): דרוש `auth` לקריאת
   הנתונים, ואפשר למשתמש מאומת לקרוא את צומת-התפקיד שלו (super_admins/allowed_users/allowed_viewers)
   ואת `settings`.

## מודל settings/appearance (נכתב מ-setup.html, נקרא בזמן-ריצה)
- `theme`   : preset, bg, surface, text, accent, accentDark, fontFamily, fontUrl (פונט מותאם)
- `logo`    : logoUrl, poweredByUrl, themeColor
- `qr`      : showOnPublic, title, sub, en   (PUBLIC בלבד; קישור-היעד נשאר ב-settings/qrLinks)
- `access`  : indexMode (open|restricted), indexMinRole (viewer|admin|super_admin)

`public/appearance.js` (`applyAppearance`) מחיל את כל אלה: צבעים כ-CSS vars על `:root`, גופן דינמי
(`--app-font` + טעינת Google-Font או `@font-face` ל-fontUrl), לוגו, meta theme-color, וטקסט/הצגת-QR.
נטען בכל הדפים + setup.

## תוספות מראה (setup.html -> "מראה ומיתוג")
- **צבע לפי קוד HEX** לצד כל בורר-צבע (סנכרון דו-כיווני).
- **חילוץ פלטה מ-PDF / תמונה** (צד-לקוח, pdf.js): מעלים קובץ -> שיבוץ אוטומטי (רקע/טקסט/הדגשה) + כוונון.
- **חילוץ מאתר אינטרנט**: Cloud Function `extractTheme` (functions v2, us-central1). ה-UI גוזר את
  כתובת הפונקציה מזיהוי הפרויקט (דריסה תחת "הגדרות מתקדמות"). **תנאים מוקדמים לפריסה (התבררו בשטח -
  חובה לכולם, אחרת נכשל; פירוט מלא ב-`HANDOFF.md`):**
  1. **Blaze** מופעל על הפרויקט.
  2. **תפקידי IAM ל-SA של ה-Action** (`firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com`):
     **Editor** + **Service Account User** + **Cloud Functions Admin** + **Cloud Run Admin**.
     ⚠️ `Cloud Functions Admin` הוא הקריטי (נותן `setIamPolicy` להפיכת הפונקציה לציבורית) - Editor
     לבדו לא מספיק, ואל תבלבל בינו ל-`Cloud Run Admin`.
  3. פריסה: Actions -> Run workflow -> branch main -> target **`functions:extractTheme`** (לא
     `functions,hosting`), או מקומית `firebase deploy --only functions:extractTheme -P <project>`.
  4. `functions/index.js` מכיל **רק את extractTheme** (בלי `defineSecret`) - אחרת ניתוח-הקוד של
     ה-CLI נופל על Secret Manager. ההתראות מנוהלות ב-apps-script, לא כאן.
- **פונט מותאם**: לפי URL (מיידי), או **העלאת קובץ ל-Storage** - דורש **הפעלת Firebase Storage** +
  פריסת כללים: `firebase deploy --only storage` (הכללים ב-`storage.rules`).
- **תבנית ערכה**: ייצוא/ייבוא JSON להעברת ערכה מפרויקט אחד לאחר (כל פרויקט = תבנית).
