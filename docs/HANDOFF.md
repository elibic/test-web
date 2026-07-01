# HANDOFF - מצב הפרויקט (test-web) והמשך עבודה

מסמך המשכיות בין סשנים. יעד: ריפו **test-web** (Firebase project `test-94822`),
ענף פיתוח `claude/kiosk-display-styling-7vy8vd`. כל הטקסט במקף רגיל `-` בלבד.

test-web = clone-בדיקה בטוח של פרויקט-הדגל ramada, לאימות מערכת-השכפול לפני החלה על ramada.

---

## מה הושלם (נפרס וחי ב-test-94822)

### 1. מסך התחברות בסגנון nitza20 (שער INDEX)
- `#indexAuthScreen` ב-`public/index.html` עוצב מחדש להתאמה מלאה ל-nitza20: רקע radial כהה,
  כרטיס-זכוכית זהב, כפתור Google עם לוגו-SVG, מפריד "או", שדות אימייל/סיסמה עם הצג/הסתר-סיסמה,
  וקישור "שכחתי סיסמה" (`sendPasswordResetEmail`).
- CSS **ממודר תחת `#indexAuthScreen`** ב-`public/style.css` (פלטת nitza20 קבועה עם `--ia-*`),
  כדי שלא ייגע במודלים/ערכת-הצבע של הדשבורד. נוסף גופן **Heebo** ב-`<head>`.
- לוגיקה ב-`public/script.js`: `showIndexAuth` / `ensureIndexAccess` (Google + אימייל/סיסמה +
  הצג-סיסמה + forgot + מסך "אין הרשאה" עם "התנתק").
- כפתור **"התנתקות מהמערכת"** נוסף ל-`#settingsModal` (`indexLogout()`), **מוצג רק כשה-INDEX מוגבל**.
- כל זה מופיע רק כאשר `settings/appearance.access.indexMode === 'restricted'` (נקבע ב-setup.html
  -> "מראה ומיתוג" -> גישת INDEX). בפרויקט פתוח - הדף נטען כרגיל.

### 2. חילוץ ערכת-נושא מאתר (extractTheme) - נפרס בהצלחה
- `functions/index.js` צומצם ל-**extractTheme בלבד** (ראה הגוצ'ות למטה - זה היה קריטי לפריסה).
- הפונקציה חיה: `https://us-central1-test-94822.cloudfunctions.net/extractTheme`
  (ה-UI ב-setup.html גוזר את הכתובת אוטומטית מזיהוי-הפרויקט; דריסה תחת "הגדרות מתקדמות").
- החילוץ-מאתר במסך "מראה ומיתוג" עובד מקצה-לקצה.

---

## ⚠️ מה היה צריך כדי שפריסת ה-Cloud Function תעבוד (הכי חשוב - לשכפול)

פריסת `functions:extractTheme` נכשלה כמה פעמים ברצף. אלה **כל** התנאים שהתבררו כנדרשים.
בשכפול לבניין חדש - חובה לחזור על כולם (מפורט גם ב-`REPLICATION.md`):

1. **Blaze** - הפרויקט חייב תוכנית Blaze (פונקציות v2 = billing). ללא זה הבנייה נכשלת.

2. **ארבעה תפקידי IAM ל-Service Account של ה-Action.**
   ה-SA הוא **`firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com`** (זה שה-JSON שלו
   ב-secret `FIREBASE_SERVICE_ACCOUNT`). ב-Google Cloud Console -> IAM -> עורכים אותו ומוסיפים:
   - **Editor** - בנייה/פריסה כללית + הפעלת APIs (Service Usage). בלעדיו: `403 Permission
     denied to get service [cloudfunctions.googleapis.com]`.
   - **Service Account User** - `actAs` על ה-runtime SA.
   - **Cloud Functions Admin** - **הקריטי והמתפספס**. נותן את `cloudfunctions.functions.setIamPolicy`
     (הפיכת ה-HTTPS function לציבורית-לקריאה). **תפקיד Editor לא כולל setIamPolicy!** בלעדיו:
     `Missing required permission ... cloudfunctions.functions.setIamPolicy`.
   - **Cloud Run Admin** - פונקציות v2 רצות מעל Cloud Run.
   - ⚠️ **טעות שקרתה בפועל:** בלבול בין "Cloud Run Admin" ל-"Cloud Functions Admin". צריך את
     **שניהם**, וה-setIamPolicy מגיע דווקא מ-**Cloud Functions Admin**.
   - המתן ~1-2 דקות אחרי Save (התפשטות IAM) לפני הרצה חוזרת.

3. **target = `functions:extractTheme`** בהרצת ה-workflow (לא ברירת-המחדל `functions,hosting`).
   אחרת ה-CLI מנסה לפרוס גם את פונקציות ההתראות.

4. **`functions/index.js` = extractTheme בלבד, בלי סודות.** גוצ'ה מרכזית: גם `--only
   functions:extractTheme` גורם ל-CLI **לטעון ולנתח את כל index.js** ולאמת כל `defineSecret`
   מול Secret Manager. פונקציות ההתראות הכריזו על `SMTP_PASS`/`NOTIFY_TEST_KEY` -> נכשל ב-
   `403 Secret Manager API ... has not been used / disabled`. הפתרון שיושם: **הוסרו פונקציות
   ההתראות מ-index.js** (הן מנוהלות ב-apps-script; אין להריץ שתי שכבות - התראות כפולות).
   הלוגיקה נשמרה ב-`functions/lib/` + הבדיקות (`night`/`watch`), שאינן תלויות ב-index.js.

5. שאר ה-APIs (cloudfunctions, cloudbuild, artifactregistry, run, eventarc, pubsub, storage)
   מופעלים אוטומטית ע"י הפריסה, בזכות Editor.

**רצף האבחון בפועל (לסקירה):** 403 Service Usage (חסר Editor) -> 403 Secret Manager (index.js
עם סודות) -> target שגוי (`functions,hosting`) -> 403 setIamPolicy (חסר Cloud Functions Admin) -> ✅.

---

## מצב מערכת "מראה ומיתוג" (appearance)
- מקור-אמת: `settings/appearance` ב-RTDB. `public/appearance.js` (`applyAppearance`) מחיל בזמן-ריצה.
- עובד: presets, צבעים ידניים + **HEX**, לוגו, QR ב-PUBLIC (הצגה + טקסט), גישת INDEX,
  חילוץ מ-PDF/תמונה (צד-לקוח), ייצוא/ייבוא JSON (תבנית), העלאת פונט ל-Storage,
  ו-**חילוץ מאתר (extractTheme) - עכשיו עובד**.
- העלאת-פונט ל-Storage דורשת הפעלת Firebase Storage + `firebase deploy --only storage`
  (כללים ב-`storage.rules`). **לבדוק אם נפרס** ב-test-94822.

---

## פתוח להמשך (Next)
- **INDEX** - המשתמש ביקש להתמקד בזה בהמשך ("בהמשך נתמקד ב-INDEX").
- **פורט לפרויקט-הדגל ramada** - להעביר את מסך-ההתחברות + מערכת ה-appearance ל-ramada-web.
- לשקול: להפוך `functions:extractTheme` לברירת-מחדל בתפריט ה-workflow (כדי לא לבחור ידנית כל פעם).
- לשקול: לפרוס `storage` (העלאת פונט) אם עוד לא נפרס.

---

## עובדות תשתית
- Firebase project: **test-94822** | Hosting URL: `https://test-94822.web.app`
- **⚠️ ה-proxy של סביבת-הפיתוח חוסם יציאה ל-`*.web.app` / `*.cloudfunctions.net`** (403 CONNECT
  tunnel). אי אפשר לאמת אתר-חי מכאן - **מקור-האמת לפריסה = לוג ה-GitHub Action** (יש גישת-קריאה).
- פריסה: **push ל-main = hosting בלבד** (אוטומטי, `.github/workflows/firebase-deploy.yml`).
  **functions = ידני**: Actions -> "Deploy to Firebase" -> Run workflow -> branch main ->
  target `functions:extractTheme`. (אין הרשאת dispatch מהסוכן; המשתמש לוחץ Run, הסוכן קורא לוג.)
- אימות מקומי: `python3 -m http.server --directory public` + Chromium headless
  ב-`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (הזרקת stub של Firebase לבדיקות UI).
- אילוצים: מקף רגיל בלבד (לא em-dash); לא לכתוב מזהה-מודל בקבצים; scope = 5 ריפו בלבד
  (elevator-logs, ramada-web, elevator-rpi, test-web, admin-dashboard). nitza20 שוכפל מקומית
  לעיון (מקור עיצוב מסך-ההתחברות) - לא ב-scope הקבוע.
