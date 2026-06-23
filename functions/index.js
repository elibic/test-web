/**
 * Cloud Functions — שכבת התראות "תמיד-חיה" למערכת מעלית שבת (פרויקט ramada-elev).
 *
 * רצה בענן ולכן עובדת גם כשה-Pi כבוי / הפסקת חשמל. שלוש התראות:
 *   1. כניסה למצב שבת   — SHABBAT_ACTIVE עבר false→true
 *   2. יציאה ממצב שבת   — SHABBAT_ACTIVE עבר true→false
 *   3. אין תנועה X זמן  — elevators/{id}/timestamp לא התקדם (החרגת לילה).
 *                         מכסה גם הפסקת-חשמל: Pi מת ⇒ timestamp קופא.
 *
 * סודות (TELEGRAM_BOT_TOKEN, SMTP_PASS, NOTIFY_TEST_KEY) ב-Functions Secrets בלבד.
 * העדפות (ערוצים, סף, חלון לילה) ב-/settings/notifications ב-RTDB — ניתנות לעריכה.
 */
const admin = require("firebase-admin");
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const { dispatch, nowStamp } = require("./lib/notify");
const { noMovementDecision } = require("./lib/watch");

admin.initializeApp();

const REGION = "europe-west1";                 // תואם לאזור ה-RTDB
const INSTANCE = "ramada-elev-default-rtdb";   // שם מופע ה-RTDB

// סודות שנפרסים כעת (מייל + endpoint הבדיקה).
const SMTP_PASS = defineSecret("SMTP_PASS");
const NOTIFY_TEST_KEY = defineSecret("NOTIFY_TEST_KEY");
const SECRETS = [SMTP_PASS, NOTIFY_TEST_KEY];
// להפעלת Telegram בהמשך:
//   1) firebase functions:secrets:set TELEGRAM_BOT_TOKEN
//   2) הוסף  defineSecret("TELEGRAM_BOT_TOKEN")  ל-SECRETS למעלה
//   3) הפעל את הערוץ ב-/settings/notifications (channels.telegram) ו-redeploy.
// הקוד ב-lib/notify.js כבר תומך ב-Telegram; הוא פשוט לא יישלח כל עוד הערוץ כבוי.

function isActive(v) {
  return v === true || v === 1 || v === "true" || v === "force_on";
}

async function loadSettings() {
  const snap = await admin.database().ref("/settings/notifications").get();
  return snap.val() || {};
}

// ── 1 + 2: כניסה/יציאה ממצב שבת (טריגר מיידי על שינוי) ───────────────────────
exports.onShabbatActiveChange = onValueWritten(
  {
    ref: "/elevator_configs/{id}/SHABBAT_ACTIVE",
    instance: INSTANCE,
    region: REGION,
    secrets: SECRETS,
  },
  async (event) => {
    const before = isActive(event.data.before.val());
    const after = isActive(event.data.after.val());
    if (before === after) return; // אין מעבר אמיתי

    const id = event.params.id;
    const settings = await loadSettings();
    if (!settings.enabled) return;

    const events = settings.events || {};
    const key = after ? "shabbat_enter" : "shabbat_exit";
    if (events[key] === false) return;

    const subject = after
      ? `🕯️ מעלית ${id}: נכנסה למצב שבת`
      : `✅ מעלית ${id}: יצאה ממצב שבת`;
    const body = `זמן: ${nowStamp()}`;
    const results = await dispatch(settings, subject, body);
    logger.info("shabbat-change alert", { id, active: after, results });
  }
);

// ── 3: אין תנועה (החרגת לילה) — גם תופס הפסקת-חשמל ────────────────────────────
exports.noMovementWatch = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "Asia/Jerusalem",
    region: REGION,
    secrets: SECRETS,
  },
  async () => {
    const settings = await loadSettings();
    if (!settings.enabled) return;
    if ((settings.events || {}).no_movement === false) return;

    const nm = settings.no_movement || {};
    const thresholdH = Number(nm.threshold_hours != null ? nm.threshold_hours : 10);
    const nightStart = nm.night_start || "23:00";
    const nightEnd = nm.night_end || "06:00";

    const db = admin.database();
    const elevators = (await db.ref("/elevators").get()).val() || {};
    const now = Date.now() / 1000;

    const opts = { thresholdHours: thresholdH, nightStart, nightEnd };
    for (const [id, e] of Object.entries(elevators)) {
      const ts = Number((e && e.timestamp) || 0);
      if (!ts) continue;

      const stateRef = db.ref(`/notify_state/${id}`);
      const prev = (await stateRef.get()).val() || {};
      const { alert, state } = noMovementDecision(prev, ts, now, opts);

      if (alert) {
        const last = new Date(ts * 1000).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
        const subject = `⚠️ מעלית ${id}: אין תנועה ${thresholdH}+ שעות (לא כולל לילה)`;
        const body =
          `לא זוהתה תנועה מאז ${last}.\n` +
          `זמן בדיקה: ${nowStamp()}\n` +
          `ייתכן שהמעלית תקועה, ה-tracker אינו פעיל, או הפסקת חשמל.`;
        const results = await dispatch(settings, subject, body);
        logger.warn("no-movement alert", { id, results });
      }
      await stateRef.update(state);
    }
  }
);

// ── בדיקה ידנית: GET https://.../notifyTest?key=NOTIFY_TEST_KEY ──────────────
exports.notifyTest = onRequest(
  { region: REGION, secrets: SECRETS },
  async (req, res) => {
    const expected = process.env.NOTIFY_TEST_KEY;
    if (!expected || req.query.key !== expected) {
      res.status(403).json({ ok: false, error: "forbidden — חסר/שגוי ?key" });
      return;
    }
    const settings = await loadSettings();
    const subject = "🔔 בדיקת התראות — מעלית שבת (ענן)";
    const body = `זוהי הודעת בדיקה משכבת ההתראות בענן.\nזמן: ${nowStamp()}`;
    const forced = Object.assign({}, settings, { enabled: true }); // בדיקה עוקפת enabled
    const results = await dispatch(forced, subject, body);
    res.json({ ok: results.some((r) => r.ok), results });
  }
);
