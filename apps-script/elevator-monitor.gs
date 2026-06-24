/**
 * elevator-monitor.gs — ניטור והתראות מרכזי לכל מעליות השבת (כל הפרויקטים).
 *
 * סקריפט אחד ב-Google Apps Script (script.google.com) עם טריגר מתוזמן (~5 דק').
 * שולח מייל דרך MailApp — מחשבון ה-Google שלך, בלי SMTP ובלי סיסמת-אפליקציה.
 * עובד גם כשה-Pi כבוי / הפסקת-חשמל (חיצוני ל-Pi, קורא ישירות מ-Firebase).
 *
 * ▸ רשימת הפרויקטים + ההגדרות-פר-פרויקט מגיעות מ-hub האדמין (econtrolelevelev):
 *   /projects/<id> = { name, webConfig.databaseURL, notifications:{...} }.
 *   את ה-notifications מנהלים מהדשבורד ("🔔 התראות" בכל כרטיס פרויקט) — לא כאן.
 *
 * ▸ לכל פרויקט קוראים את ה-DB שלו (/elevators, /elevator_configs — קריאה ציבורית,
 *   בדיוק כמו שהדשבורד והתצוגות הציבוריות קוראים), ומזהים שלוש התראות:
 *     1. כניסה למצב שבת   (SHABBAT_ACTIVE: false→true)
 *     2. יציאה ממצב שבת   (true→false)
 *     3. אין תנועה X שעות (החרגת לילה) — elevators/{id}/timestamp קופא; תופס גם הפסקת-חשמל.
 *
 * המצב הקודם נשמר ב-PropertiesService לפי <project>/<elevator> (מניעת כפילויות).
 */

// ===================== הגדרות — ערוך כאן בלבד =====================
// hub האדמין: מקור רשימת הפרויקטים וההגדרות (אותו DB שהדשבורד כותב אליו).
var ADMIN_DB_URL = "https://econtrolelevelev-default-rtdb.europe-west1.firebasedatabase.app";

// /projects מאחורי הרשאה (יש בו secret_keys) ⇒ דרוש database secret של econtrolelevelev:
//   Firebase Console → ⚙️ Project settings → Service accounts → Database secrets → Show → העתק לכאן.
var ADMIN_DB_AUTH = "";

// ברירות מחדל אם פרויקט לא הגדיר ערך בדשבורד:
var DEFAULT_THRESHOLD_HOURS = 8;   // סף "אין תנועה" (שעות-יום נטו, ללא לילה)
var DEFAULT_NIGHT_START = 23;      // תחילת לילה (שעה מקומית)
var DEFAULT_NIGHT_END = 6;         // סוף לילה
// ================================================================

/** הפונקציה שמריצים בטריגר המתוזמן (כל ~5 דקות). */
function monitorElevators() {
  var projects = fetchJson(ADMIN_DB_URL, "/projects", ADMIN_DB_AUTH);
  if (!projects) { Logger.log("לא נטענו פרויקטים מ-/projects (בדוק ADMIN_DB_AUTH)"); return; }
  Object.keys(projects).forEach(function (pid) {
    try { monitorProject(pid, projects[pid]); }
    catch (e) { Logger.log("פרויקט " + pid + " נכשל: " + e); }
  });
}

/** מנטר פרויקט בודד לפי ההגדרות שלו מהדשבורד. */
function monitorProject(pid, proj) {
  if (!proj) return;
  var n = proj.notifications || {};
  if (n.enabled === false) return;                       // כבוי בדשבורד
  var emailTo = String(n.email_to || "").trim();
  var tg = n.telegram || {};
  var tgChats = parseList(tg.chat_ids);
  if (!emailTo && !tgChats.length) return;               // אין נמענים ⇒ דלג

  var dbUrl = proj.webConfig && proj.webConfig.databaseURL;
  if (!dbUrl) { Logger.log(pid + ": חסר webConfig.databaseURL"); return; }
  dbUrl = String(dbUrl).replace(/\/+$/, "");

  var opt = {
    name: proj.name || pid,
    emailTo: emailTo,
    tgToken: tg.bot_token || "",
    tgChats: tgChats,
    ev: n.events || {},
    thresh: n.threshold_hours != null ? Number(n.threshold_hours) : DEFAULT_THRESHOLD_HOURS,
    nightStart: n.night_start != null ? Number(n.night_start) : DEFAULT_NIGHT_START,
    nightEnd: n.night_end != null ? Number(n.night_end) : DEFAULT_NIGHT_END,
  };

  var elevators = fetchJson(dbUrl, "/elevators", "") || {};
  Object.keys(elevators).forEach(function (id) {
    try { checkElevator(pid, dbUrl, id, opt); }
    catch (e) { Logger.log(pid + "/" + id + " נכשל: " + e); }
  });
}

function checkElevator(pid, dbUrl, id, opt) {
  var props = PropertiesService.getScriptProperties();
  var tag = pid + "/" + id;

  // ── 1+2: כניסה/יציאה ממצב שבת ──────────────────────────────────
  var cfg = fetchJson(dbUrl, "/elevator_configs/" + id, "");
  if (cfg && cfg.SHABBAT_ACTIVE !== undefined && cfg.SHABBAT_ACTIVE !== null) {
    var active = isActive(cfg.SHABBAT_ACTIVE);
    var key = "shabbat_" + tag;
    var prev = props.getProperty(key);
    if (prev !== null && (prev === "1") !== active) {
      var want = active ? (opt.ev.shabbat_enter !== false) : (opt.ev.shabbat_exit !== false);
      if (want) {
        var subj = active
          ? "🕯️ " + opt.name + " · מעלית " + id + ": נכנסה למצב שבת"
          : "✅ " + opt.name + " · מעלית " + id + ": יצאה ממצב שבת";
        sendAlert(opt, subj, subj + "\nזמן: " + nowStr());
      }
    }
    props.setProperty(key, active ? "1" : "0");
  }

  // ── 3: אין תנועה (החרגת לילה) — תופס גם הפסקת-חשמל ─────────────
  if (opt.ev.no_movement === false) return;
  var elev = fetchJson(dbUrl, "/elevators/" + id, "");
  if (!elev || !elev.timestamp) return;
  var ts = Number(elev.timestamp), now = Math.floor(Date.now() / 1000);

  var lastKey = "nomove_lastts_" + tag, alertedKey = "nomove_alerted_" + tag;
  var prevTs = Number(props.getProperty(lastKey) || 0);
  var alerted = props.getProperty(alertedKey) === "1";
  if (ts > prevTs) alerted = false;                      // זוהתה תנועה ⇒ איפוס

  var daytimeH = daytimeSecondsBetween(ts, now, opt.nightStart, opt.nightEnd) / 3600;
  if (!alerted && daytimeH >= opt.thresh) {
    var last = Utilities.formatDate(new Date(ts * 1000), "Asia/Jerusalem", "dd/MM/yyyy HH:mm:ss");
    var subject = "⚠️ " + opt.name + " · מעלית " + id + ": אין תנועה " + daytimeH.toFixed(1) + " שעות (נטו)";
    var body = subject + "\n\nעדכון אחרון התקבל: " + last + "\nזמן בדיקה: " + nowStr() +
               "\nייתכן שהמעלית תקועה, ה-tracker אינו פעיל, או הפסקת חשמל.";
    sendAlert(opt, subject, body);
    alerted = true;
  }
  props.setProperty(lastKey, String(ts));
  props.setProperty(alertedKey, alerted ? "1" : "0");
}

/** שניות-יום בלבד בין שני זמני epoch (מחסיר את חלון הלילה nightStart→nightEnd). */
function daytimeSecondsBetween(start, end, nightStart, nightEnd) {
  if (end <= start) return 0;
  var night = 0;
  var day = new Date(start * 1000);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - 1);                        // יום אחורה לתפיסת לילה שהתחיל אתמול
  while (day.getTime() / 1000 < end) {
    var a = new Date(day); a.setHours(nightStart, 0, 0, 0);
    var b = new Date(day); b.setHours(nightEnd, 0, 0, 0);
    if (nightEnd <= nightStart) b.setDate(b.getDate() + 1); // חלון חוצה חצות
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

function parseList(s) {
  if (!s) return [];
  return String(s).split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
}

function fetchJson(baseUrl, path, auth) {
  var url = baseUrl + path + ".json";
  if (auth) url += "?auth=" + auth;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log("DB " + baseUrl + path + " → HTTP " + res.getResponseCode() + ": " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText());
}

function nowStr() {
  return Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm:ss");
}

function sendAlert(opt, subject, body) {
  // מייל — מחשבון ה-Google שלך, בלי SMTP
  try { if (opt.emailTo) MailApp.sendEmail(opt.emailTo, subject, body); }
  catch (e) { Logger.log("שליחת מייל נכשלה: " + e); }
  // טלגרם — רק אם הוגדר לפרויקט
  if (opt.tgToken && opt.tgChats && opt.tgChats.length) {
    opt.tgChats.forEach(function (chatId) {
      try {
        UrlFetchApp.fetch("https://api.telegram.org/bot" + opt.tgToken + "/sendMessage", {
          method: "post", contentType: "application/json", muteHttpExceptions: true,
          payload: JSON.stringify({ chat_id: chatId, text: subject + "\n" + body, disable_web_page_preview: true }),
        });
      } catch (e) { Logger.log("טלגרם נכשל ל-" + chatId + ": " + e); }
    });
  }
}

/** בדיקה ידנית — הרץ פעם אחת מהעורך: מאשר הרשאות, מדפיס את הפרויקטים, ושולח מייל-בדיקה לנמען הראשון. */
function sendTestAlert() {
  var projects = fetchJson(ADMIN_DB_URL, "/projects", ADMIN_DB_AUTH) || {};
  var lines = Object.keys(projects).map(function (pid) {
    var n = projects[pid].notifications || {};
    var who = n.enabled === false ? "(כבוי)" : (String(n.email_to || "").trim() || "(אין נמענים)");
    return "• " + (projects[pid].name || pid) + " → " + who;
  });
  Logger.log("פרויקטים (" + lines.length + "):\n" + lines.join("\n"));

  var firstTo = "";
  Object.keys(projects).some(function (pid) {
    var n = projects[pid].notifications || {};
    if (n.enabled !== false && String(n.email_to || "").trim()) { firstTo = n.email_to; return true; }
    return false;
  });
  if (firstTo) {
    MailApp.sendEmail(firstTo, "🔔 בדיקת התראות מרכזית (Apps Script)",
      "בדיקה מהסקריפט המרכזי.\nזמן: " + nowStr() + "\n\nפרויקטים:\n" + lines.join("\n"));
    Logger.log("מייל בדיקה נשלח ל-" + firstTo);
  } else {
    Logger.log("לא נמצא נמען. הגדר התראות בדשבורד (🔔 התראות) ונסה שוב.");
  }
}
