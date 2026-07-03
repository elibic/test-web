# Ramada Shabbat Elevator — Web

קבצי הווב של מערכת מעלית שבת (Ramada), הנפרסים ל‑Firebase Hosting
(פרויקט: `test-94822`).

> 🗄️ **הריפו מיועד לארכיון (read-only).** כל התוכן החי עבר: hosting למונו-רפו ב-ramada-web,
> תיעוד ל-`ramada-web/docs/`, ופריסת `extractTheme` תרוכז אף היא שם (תוכנית האיחוד, יולי 2026).
> הריפו נשמר כהיסטוריה וכגיבוי-rollback בלבד - אין לערוך בו דבר.

> ⚠️ **HOSTING עבר למונו-רפו.** מקור-האמת לקוד ה-web הוא כעת ריפו **ramada-web** תחת `monorepo/`
> (`shared/public` + `projects/test-94822/firebase-config.js`). **אל תערוך כאן את `public/` לצורך
> פריסה** - השינויים נעשים במונו-רפו ונפרסים לכל הבניינים יחד. פריסת ה-hosting של test-94822
> מתבצעת שם דרך `preview-project.yml` (תצוגה) / `deploy-all.yml` (פרודקשן). ה-`public/` כאן נשמר
> זמנית כגיבוי/rollback בלבד.

## מבנה

- `public/` — עותק rollback של קבצי האתר. **מקור-האמת הוא `ramada-web/monorepo/shared/public`.**
- `functions/` — `extractTheme` (נפרס ידנית דרך `firebase-deploy.yml`, functions-only).

## פריסה

ה-**hosting** של `test-94822` נפרס מהמונו-רפו (ריפו `ramada-web`):
`preview-project.yml` (תצוגה) / `deploy-all.yml` (פרודקשן), project=`test-94822`.
**אין לפרוס hosting מכאן** (נטרלנו את זה כדי למנוע פריסה כפולה).

---

*מנוהל ב‑Git ו‑GitHub מאז יוני 2026. hosting אוחד למונו-רפו ביולי 2026.*
