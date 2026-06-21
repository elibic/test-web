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

## פריסה
- **תמיד גבה את `public/` לפני deploy.**
- `firebase deploy --only hosting` (project `ramada-elev`).
