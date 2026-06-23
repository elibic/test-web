# CLAUDE.md — ramada-web

קבצי הווב של מערכת מעלית שבת (Ramada), הנפרסים ל-Firebase Hosting (project: `ramada-elev`).
פאנל מצב מעלית בזמן אמת, רספונסיבי (kiosk / portrait / wide).

## הקובץ הראשי
- ערוך **`public.html`** (class `layout-public2` — כל ה-CSS/פיצ'רים תלויים בה).
- `public2.html` = redirect stub. גרסאות ישנות מארכבות ב-`OLD/`.

## ⚠️ ארכיטקטורה רספונסיבית — פאנל מעלית (אסור לשבור)
1. **CSS Grid בלבד** על `.elevator-panel` (areas: floor/info/eta/stops). אל תוסיף `display:flex`.
2. **`.eta-display` ילד ישיר** של הפאנל (מוזז ב-`createElevatorPanels` ב-`kiosk-logic.js`).
3. **Orientation דרך JS** (`data-orientation="wide"|"tall"`), לא `@container`.
4. **טיפוגרפיה ב-`cqmin` בלבד**: TALL=20cqmin, WIDE=30cqmin. `--fi-scale` מ-`floorFontScale()`.
5. `overflow: clip` על הפאנל. `.direction-status` חייב `aspect-ratio: 1`.
6. **stops strip** ילד ישיר (`grid-area: stops`). סנן ל-`[BOTTOM_FLOOR, TOP_FLOOR]` (ה-DB עלול להחזיר קומות ישנות).
7. **Cache busting:** בומפ `?v=YYYYMMDD-tag` בקבצי ה-HTML אחרי כל שינוי CSS/JS.

## ETA (`script.js`) — gotchas
- `canStopUp`/`canStopDown` בודקים userFloor (THIS_SCREEN_FLOOR), לא קומת המעלית. בדוק איזה ענף נבחר ב-`calculateAndShowETAFor`.
- `addFloorWaitAt` חייב להחזיר 26s גם ב-`topFloorNum` וגם ב-`bottomFloorNum` (ענף BOTTOM→TOP→user), אלא אם המעלית כבר שם.
- `processElevatorUpdate` דוחה עדכון רק אם גם `floor` וגם `direction` זהים.

## בדיקות חובה אחרי שינוי בפאנל
- 3 אוריינטציות: 1920×1080 (TALL), 1366×768 (WIDE), 768×1366 (portrait).
- 2 מצבים: weekday (ללא stops) + shabbat (עם stops).
- טקסטים ארוכים ("Synagogue / בית כנסת") לא חורגים מהפאנל.

## 🔔 התראות — שכבת ענן "תמיד-חיה" (`functions/`)
- **למה בענן:** ההתראות עברו מ-ה-Pi לענן כי Pi כבוי / הפסקת-חשמל לא יכול להתריע על עצמו.
- **3 התראות:** כניסה/יציאה משבת (טריגר על `elevator_configs/{id}/SHABBAT_ACTIVE`),
  ו-"אין תנועה X זמן (החרגת לילה)" (פונקציה מתוזמנת על `elevators/{id}/timestamp`;
  **תופסת גם הפסקת-חשמל** — Pi מת ⇒ timestamp קופא).
- **קוד:** `functions/index.js` (3 פונקציות + `notifyTest` ל-endpoint בדיקה),
  `lib/notify.js` (Telegram+Email), `lib/night.js` + `lib/watch.js` (חישוב יום/לילה +
  watchdog טהור עם בדיקות; נמל מ-`elevator-rpi/shabbat_detector/notifier.py`).
- **סודות → Functions Secrets בלבד** (`TELEGRAM_BOT_TOKEN`, `SMTP_PASS`, `NOTIFY_TEST_KEY`) —
  לא ב-DB, לא ב-Git. **העדפות → `/settings/notifications` ב-RTDB** (ניתן לעריכה).
  מצב פנימי למניעת כפילות → `/notify_state/{id}`.
- **חשוב:** השאר את ההתראות על ה-Pi **כבויות** (`rfid_config.json→notifications.enabled:false`)
  כדי לא לקבל פעמיים. הוראות פריסה ובדיקה מלאות: `functions/README.md`.

## פריסה
- **תמיד גבה את `public/` לפני deploy.**
- Hosting: `firebase deploy --only hosting` (project `ramada-elev`).
- Functions: `cd functions && npm install` → `firebase deploy --only functions`
  (דורש Blaze + הגדרת Secrets — ראה `functions/README.md`).
