# Ramada Shabbat Elevator — Web

קבצי הווב של מערכת מעלית שבת (Ramada), הנפרסים ל‑Firebase Hosting
(פרויקט: `test-94822`).

> ⚠️ **HOSTING עבר למונו-רפו.** מקור-האמת לקוד ה-web הוא כעת ריפו **ramada-web** תחת `monorepo/`
> (`shared/public` + `projects/test-94822/firebase-config.js`). **אל תערוך כאן את `public/` לצורך
> פריסה** - השינויים נעשים במונו-רפו ונפרסים לכל הבניינים יחד. פריסת ה-hosting של test-94822
> מתבצעת שם דרך `preview-project.yml` (תצוגה) / `deploy-all.yml` (פרודקשן). ה-`public/` כאן נשמר
> זמנית כגיבוי/rollback בלבד.

## מבנה

- `public/` — קבצי האתר (HTML / CSS / JS) שמוגשים למשתמשים.
- `firebase.json` — הגדרות הפריסה ל‑Firebase Hosting.

## פריסה

```bash
firebase deploy --only hosting
```

---

*מנוהל ב‑Git ו‑GitHub מאז יוני 2026.*
