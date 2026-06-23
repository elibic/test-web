/**
 * elevator-monitor.gs — ניטור והתראות למעליות שבת (פרויקט ramada-elev).
 *
 * רץ ב-Google Apps Script (script.google.com) עם טריגר מתוזמן (כל ~5 דק').
 * שולח מייל דרך MailApp — מחשבון ה-Google שלך, בלי SMTP ובלי סיסמת-אפליקציה.
 * עובד גם כשה-Pi כבוי / הפסקת-חשמל, כי הוא חיצוני ל-Pi וקורא ישירות מ-Firebase.
 *
 * שלוש התראות:
 *   1. כניסה למצב שבת   (SHABBAT_ACTIVE: false→true)
 *   2. יציאה ממצב שבת   (true→false)
 *   3. אין תנועה X שעות (החרגת לילה) — elevators/{id}/timestamp קופא;
 *      תופס גם הפסקת-חשמל (Pi מת ⇒ ה-timestamp לא מתעדכן).
 *
 * המצב הקודם נשמר ב-PropertiesService (לזיהוי מעבר ולמניעת התראות כפולות) —
 * אין צורך בשום צומת/כתיבה ל-Database.
 */

// ===================== הגדרות — ערוך כאן בלבד =====================
var DB_URL = "https://ramada-elev-default-rtdb.europe-west1.firebasedatabase.app";
var ELEVATOR_IDS = [];                // ריק = זיהוי אוטומטי של כל המעליות מ-/elevators
var EMAIL_TO = "elchib18@gmail.com";  // נמענים, מופרדים בפסיק
var THRESHOLD_HOURS = 8;              // סף "אין תנועה" (שעות-יום נטו, ללא לילה)
var NIGHT_START_HOUR = 23;            // תחילת לילה (שעה מקומית)
var NIGHT_END_HOUR = 6;               // סוף לילה

// טלגרם — אופציונלי (להמשך). השאר ריק כדי לשלוח מייל בלבד:
var TELEGRAM_BOT_TOKEN = "";
var TELEGRAM_CHAT_IDS = [];           // למשל: ["-1001234567890"]

// אם קריאת ה-DB מחזירה "Permission denied" — הדבק כאן database secret של ramada-elev.
// אם הקריאה הציבורית פתוחה (כמו באתר הציבורי) — השאר ריק.
var DB_AUTH = "";
// ================================================================

/** הפונקציה שמריצים בטריגר המתוזמן (כל ~5 דקות). */
function monitorElevators() {
  var ids = ELEVATOR_IDS && ELEVATOR_IDS.length ? ELEVATOR_IDS : discoverElevatorIds();
  ids.forEach(function (id) {
    try {
      checkElevator(id);
    } catch (e) {
      Logger.log("שגיאה במעלית " + id + ": " + e);
    }
  });
}

/** זיהוי אוטומטי של כל המעליות מתוך /elevators (כמו האתר). */
function discoverElevatorIds() {
  var all = fetchJson("/elevators");
  var ids = all ? Object.keys(all) : [];
  Logger.log("מעליות שזוהו: " + (ids.length ? ids.join(", ") : "(אין)"));
  return ids;
}

function checkElevator(id) {
  var props = PropertiesService.getScriptProperties();

  // ── 1+2: כניסה/יציאה ממצב שבת ──────────────────────────────────
  var cfg = fetchJson("/elevator_configs/" + id);
  if (cfg && cfg.SHABBAT_ACTIVE !== undefined && cfg.SHABBAT_ACTIVE !== null) {
    var active = isActive(cfg.SHABBAT_ACTIVE);
    var key = "shabbat_" + id;
    var prev = props.getProperty(key);
    if (prev !== null && (prev === "1") !== active) {
      var subj = active
        ? "🕯️ מעלית " + id + ": נכנסה למצב שבת"
        : "✅ מעלית " + id + ": יצאה ממצב שבת";
      sendAlert(subj, subj + "\nזמן: " + nowStr());
    }
    props.setProperty(key, active ? "1" : "0");
  }

  // ── 3: אין תנועה (החרגת לילה) — תופס גם הפסקת-חשמל ─────────────
  var elev = fetchJson("/elevators/" + id);
  if (!elev || !elev.timestamp) return;
  var ts = Number(elev.timestamp);
  var now = Math.floor(Date.now() / 1000);

  var lastKey = "nomove_lastts_" + id, alertedKey = "nomove_alerted_" + id;
  var prevTs = Number(props.getProperty(lastKey) || 0);
  var alerted = props.getProperty(alertedKey) === "1";
  if (ts > prevTs) alerted = false; // זוהתה תנועה ⇒ איפוס האפיזודה

  var daytimeH = daytimeSecondsBetween(ts, now) / 3600;
  if (!alerted && daytimeH >= THRESHOLD_HOURS) {
    var last = Utilities.formatDate(new Date(ts * 1000), "Asia/Jerusalem", "dd/MM/yyyy HH:mm:ss");
    var subject = "⚠️ מעלית " + id + ": אין תנועה " + daytimeH.toFixed(1) + " שעות (נטו, ללא לילה)";
    var body = subject + "\n\nעדכון אחרון התקבל: " + last + "\nזמן בדיקה: " + nowStr() +
               "\nייתכן שהמעלית תקועה, ה-tracker אינו פעיל, או הפסקת חשמל.";
    sendAlert(subject, body);
    alerted = true;
  }
  props.setProperty(lastKey, String(ts));
  props.setProperty(alertedKey, alerted ? "1" : "0");
}

/** שניות-יום בלבד בין שני זמני epoch (מחסיר את חלון הלילה NIGHT_START→NIGHT_END). */
function daytimeSecondsBetween(start, end) {
  if (end <= start) return 0;
  var night = 0;
  var day = new Date(start * 1000);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - 1); // יום אחורה כדי לתפוס לילה שהתחיל אתמול
  while (day.getTime() / 1000 < end) {
    var a = new Date(day); a.setHours(NIGHT_START_HOUR, 0, 0, 0);
    var b = new Date(day); b.setHours(NIGHT_END_HOUR, 0, 0, 0);
    if (NIGHT_END_HOUR <= NIGHT_START_HOUR) b.setDate(b.getDate() + 1); // חלון חוצה חצות
    var lo = Math.max(a.getTime() / 1000, start);
    var hi = Math.min(b.getTime() / 1000, end);
    if (hi > lo) night += hi - lo;
    day.setDate(day.getDate() + 1);
  }
  return Math.max(0, (end - start) - night);
}

function isActive(v) {
  return v === true || v === 1 || v === "true" || v === "force_on";
}

function fetchJson(path) {
  var url = DB_URL + path + ".json";
  if (DB_AUTH) url += "?auth=" + DB_AUTH;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log("DB " + path + " → HTTP " + res.getResponseCode() + ": " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText());
}

function nowStr() {
  return Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm:ss");
}

function sendAlert(subject, body) {
  // מייל — מחשבון ה-Google שלך, בלי SMTP
  try {
    if (EMAIL_TO) MailApp.sendEmail(EMAIL_TO, subject, body);
  } catch (e) {
    Logger.log("שליחת מייל נכשלה: " + e);
  }
  // טלגרם — רק אם הוגדר
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length) {
    TELEGRAM_CHAT_IDS.forEach(function (chatId) {
      try {
        UrlFetchApp.fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
          method: "post", contentType: "application/json", muteHttpExceptions: true,
          payload: JSON.stringify({
            chat_id: chatId, text: subject + "\n" + body, disable_web_page_preview: true,
          }),
        });
      } catch (e) {
        Logger.log("טלגרם נכשל ל-" + chatId + ": " + e);
      }
    });
  }
}

/** בדיקה ידנית — הרץ אותה פעם אחת מהעורך כדי לאשר הרשאות ולקבל מייל בדיקה. */
function sendTestAlert() {
  sendAlert("🔔 בדיקת התראות — מעלית שבת",
    "זוהי הודעת בדיקה מסקריפט הניטור (Apps Script).\nזמן: " + nowStr());
}
