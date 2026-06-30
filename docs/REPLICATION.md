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
- `theme`   : preset, bg, surface, text, accent, accentDark, fontFamily
- `logo`    : logoUrl, poweredByUrl, themeColor
- `qr`      : showOnPublic, title, sub, en   (PUBLIC בלבד; קישור-היעד נשאר ב-settings/qrLinks)
- `access`  : indexMode (open|restricted), indexMinRole (viewer|admin|super_admin)

`public/appearance.js` (`applyAppearance`) מחיל את כל אלה: צבעים כ-CSS vars על `:root`, גופן דינמי
(`--app-font` + טעינת Google-Font), לוגו, meta theme-color, וטקסט/הצגת-QR. נטען בכל הדפים + setup.
