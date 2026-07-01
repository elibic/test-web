# תכנון: מערכת שכפול-פרויקט אוטומטית (settings + rules + nodes)

**סטטוס:** תכנון בלבד (טרם מומש). ענף פיתוח: `claude/kiosk-display-styling-7vy8vd`.
**רקע:** `REPLICATION.md` מתאר צ'ק-ליסט ידני שמכסה קוד + מראה + הוסטינג. המסמך הזה מרחיב אותו
לשכפול מלא של שכבת ה-Firebase (הגדרות, כללים, צמתים), עם **איפוס משתמשים** ו**איפוס קומות**.
כל הטקסט במקף רגיל `-` בלבד (אילוץ הפרויקט).

---

## המטרה
"שכפול בניין" בלחיצה: פרויקט חדש קם עם **אותם כללים והגדרות** של פרויקט-הדגל (ramada), אבל:
- **בלי המשתמשים** של הבניין הישן (איפוס),
- **עם קומות מאופסות** (שדה נקי לכל בניין),
- כולל **כללי-אבטחה** (שהיום חיים רק בקונסול Firebase ולא משוכפלים).

---

## המודל: 3 דליים של דאטה
מיפוי כל צמתי ה-RTDB בקוד (`grep '.ref(...)'` ב-`public/`), מחולק לפי מה קורה לכל צומת בשכפול.

### דלי 1 - קונפיג שנוסע (COPY)
| צומת | תיאור |
|---|---|
| `settings/appearance` | מראה (theme / logo / qr / access) - כבר יש export/import **חלקי** |
| `settings/qrLinks` | קישורי-יעד של ה-QR |
| `settings/banners` | באנרים |
| `settings/YOM_TOV_SHENI` | כלל גלובלי |
| `settings/SHABBAT_DETECTION` | ספי ה-FSM לזיהוי שבת |
| `settings/HEBCAL_GATE_ENABLED` (+ `_WINDOW_BEFORE_MINUTES`, `_WINDOW_AFTER_MINUTES`) | שער hebcal |
| `settings/FLOOR_ALIASES` | כינויי-קומות גלובליים |
| שלד `elevator_configs/{id}` | זמנים + מבנה, **בלי הקומות עצמן** (ראה דלי 2) |
| כללי RTDB + `storage.rules` | אבטחה |

### דלי 2 - state שמתאפס (RESET / null)
| צומת | פעולה |
|---|---|
| `super_admins`, `allowed_users`, `allowed_viewers`, `allowed_phone_numbers` | איפוס. **לזרוע את המשתמש המחובר כ-super_admin יחיד** |
| שדות-קומה ב-`elevator_configs/{id}` | ריקון: `TOP_FLOOR`, `BOTTOM_FLOOR`, `STOPPING_FLOORS`, `STOPPING_FLOORS_UP`, `STOPPING_FLOORS_DOWN`, `VISIBLE_FLOORS`, `FLOOR_WAITS` |
| `elevators/{id}` | קומה חיה (tracker) - איפוס |
| `fleet/{id}` | heartbeat / version / services - איפוס |
| `qrStats` | סטטיסטיקות סריקה - איפוס |

**מה כן נשאר** בשלד `elevator_configs/{id}` (ברירות-מחדל, לא קומות): `TIME_PER_FLOOR`,
`TIME_PASS_FLOOR`, `SHABBAT_MODE`, `AUTO_LEARN_CONFIG`, `SHABBAT_OVERRIDE: 'auto'`.
(מקור השדות: כתיבת ה-patch ב-`setup.html` סביב שורה 3748.)

### דלי 3 - bootstrap ידני (רמת Google Cloud, אי אפשר מ-UI)
מה שנשאר ב-`REPLICATION.md`: יצירת פרויקט Firebase, הפעלת Auth (Email/Password + Google) /
RTDB (EU) / Storage / Hosting, תוכנית **Blaze**, **4 תפקידי IAM** ל-SA (Editor + Service Account
User + Cloud Functions Admin + Cloud Run Admin - פירוט ב-`HANDOFF.md`), עריכת בלוק `firebaseConfig`
ב-`public/firebase-config.js`, ו-deploy ראשוני.

---

## הפער היום
1. ה-export/import ב-`setup.html` (`appBuildAppearanceObj` שורה ~3218, `appApplyImported` שורה
   ~3227) מכסה **רק appearance**. אין ייצוא/זריעה לשאר ה-`settings`, אין שלד `elevator_configs`,
   ואין כלי "איפוס משתמשים/קומות".
2. **כללי ה-RTDB לא נמצאים ב-git בכלל** - לא ב-test-web ולא ב-ramada. הם חיים רק בקונסול, אז הם
   **לא משוכפלים**. זה הפער הכי קריטי: אם INDEX מוגבל, הכללים הם האבטחה האמיתית (שער-הלקוח לבדו
   אינו אבטחה). `storage.rules` כבר ב-repo - הכללי-DB לא.

---

## שתי שכבות "משתמשים" (חשוב להבנה)
1. **Firebase Authentication** (חשבונות Google / אימייל-סיסמה): per-project. פרויקט חדש קם עם
   **אפס** משתמשים ממילא -> ברמה הזו האיפוס **אוטומטי**, אין מה להעביר.
2. **צמתי הרשאה ב-RTDB** (`super_admins` וכו'): "נוסעים" רק אם מעתיקים את כל ה-DB. הגישה כאן
   **זורעת תבנית** ולא מעתיקה DB, אז הם ריקים מעצם הבנייה. פעולת האיפוס מוסיפה את המשתמש המחובר
   בלבד כ-super_admin (מונע נעילה-בחוץ).

---

## הארכיטקטורה המומלצת (4 רכיבים)

### 1. כללי RTDB ל-repo
- קובץ חדש `database.rules.json` בשורש test-web.
- חיווט ב-`firebase.json`: `"database": { "rules": "database.rules.json" }`.
- מעכשיו `firebase deploy` (וה-GitHub Action) שולח גם כללים -> משוכפל עם הקוד.
- תוכן: דרישת `auth` לקריאה כשה-INDEX מוגבל, הרשאת-כתיבה ל-super_admin לצמתי-קונפיג, וקריאת
  צומת-התפקיד-העצמי (super_admins/allowed_users/allowed_viewers) + `settings`. טיוטה נדרשת - ראה
  "החלטות פתוחות".

### 2. תבנית-פרויקט ב-repo
- קובץ חדש `seed/project-template.json` = snapshot של דלי-1 מ-**ramada** (הדגל), עם קומות ריקות
  ובלי users:

```json
{
  "settings": {
    "appearance": {  },
    "qrLinks": {  },
    "banners": {  },
    "YOM_TOV_SHENI": null,
    "SHABBAT_DETECTION": {  },
    "HEBCAL_GATE_ENABLED": true,
    "HEBCAL_GATE_WINDOW_BEFORE_MINUTES": 0,
    "HEBCAL_GATE_WINDOW_AFTER_MINUTES": 0,
    "FLOOR_ALIASES": {  }
  },
  "elevator_configs": {
    "A": {
      "TIME_PER_FLOOR": 0,
      "TIME_PASS_FLOOR": 0,
      "SHABBAT_MODE": "automatic_split",
      "SHABBAT_OVERRIDE": "auto",
      "TOP_FLOOR": "",
      "BOTTOM_FLOOR": "",
      "STOPPING_FLOORS": [],
      "STOPPING_FLOORS_UP": [],
      "STOPPING_FLOORS_DOWN": [],
      "VISIBLE_FLOORS": [],
      "FLOOR_WAITS": {}
    }
  }
}
```

- אין צומת `super_admins`/`allowed_*` בתבנית = משתמשים ריקים.
- קומות ריקות בתבנית = קומות מאופסות.

### 3. כפתור "אתחל פרויקט מתבנית" + "איפוס" ב-setup.html
- מיקום: סקשן חדש ("שכפול / אתחול") או הרחבת סקשן "מראה" הקיים.
- הרשאה: super_admin בלבד.
- **"ייצא תבנית מלאה"**: הרחבת `appBuildAppearanceObj` -> `buildProjectTemplate()` שקורא את כל
  דלי-1 מה-DB ומוריד JSON (כך מייצרים את `seed/project-template.json` מהדגל).
- **"אתחל מתבנית"**: `applyProjectTemplate(obj)` כותב את `settings` + שלד `elevator_configs`.
- **"איפוס בניין"**: `resetBuildingState()` עושה `update` עם `null` לצמתי דלי-2, מרוקן שדות-קומה
  בכל `elevator_configs/{id}`, ואז זורע `super_admins/{uid} = true` למשתמש המחובר.
- **אישור-כפול** (`confirm2`) לפני איפוס - פעולה הרסנית.

### 4. עדכון REPLICATION.md
- ה-bootstrap הידני מצטמצם לדלי-3 בלבד.
- שאר הצעדים -> "deploy (כללים + קוד נוסעים לבד)" + "אתחל מתבנית + איפוס (לחיצה)".

---

## תרשים זרימה של שכפול בניין (אחרי המימוש)
1. bootstrap פרויקט חדש [ידני, חד-פעמי - דלי 3].
2. עריכת בלוק `firebaseConfig` ב-`firebase-config.js` + deploy [כללים + קוד נוסעים לבד].
3. כניסה ל-`setup.html` כ-super_admin ראשון -> "אתחל מתבנית" -> "איפוס בניין".
4. הזנת קומות/מעליות אמיתיות + הוספת משתמשים + רישום ב-admin-dashboard.

---

## החלטות פתוחות / סיכונים
- **תוכן כללי ה-RTDB**: לנסח טיוטה מדויקת (open מול restricted). לא קיים כרגע ברפו - לחלץ
  מהקונסול של ramada כבסיס, ולוודא שהוא תואם לזרימת ה-INDEX המוגבל.
- **נעילה-בחוץ (lockout)**: אם הכללים דורשים super_admin לכתיבה, ופעולת האיפוס מוחקת את
  `super_admins` לפני שזרעה מחדש - **סדר הפעולות קריטי**. קודם לזרוע את המשתמש המחובר, אחר כך
  למחוק את השאר; רצוי `update` אטומי יחיד.
- **admin-dashboard**: רישום הפרויקט (name / subdomain / secret_key / webConfig / databaseURL)
  נשאר ידני - לשקול אוטומציה בשלב הבא.
- **elevator IDs**: התבנית מניחה מעלית "A". בניין עם A/B/C - לשכפל את השלד לכל ID (או להזין
  ב-setup אחרי האתחול).
- **snapshot מקור**: לייצר את `seed/project-template.json` מ-**ramada** (הדגל), לא מ-test-94822.

---

## סדר בנייה מוצע (לסשן הבא)
1. `database.rules.json` + חיווט ב-`firebase.json` (הפער הכי קריטי, עצמאי - אפשר קודם).
2. `seed/project-template.json` - snapshot מ-ramada עם קומות ריקות ובלי users.
3. `setup.html`: `buildProjectTemplate` / `applyProjectTemplate` / `resetBuildingState` + UI + אישור-כפול.
4. עדכון `REPLICATION.md` + `HANDOFF.md`.
5. בדיקה ב-test-94822: "אתחל מתבנית" -> "איפוס בניין" -> לוודא ש-settings/rules/floors/users במצב הנכון.
