/**
 * notify.js — ערוצי שליחה (Telegram + Email) לשכבת ההתראות בענן.
 *
 * סודות (טוקן/סיסמה) מגיעים מ-Secrets של Functions דרך process.env — לעולם לא מ-Firebase DB.
 * ניתוב לא-סודי (chat_id, נמעני מייל, host/port) חי ב-/settings/notifications ב-RTDB.
 *
 * עיקרון: best-effort — כשל בערוץ אחד לא מפיל אחרים ולא מפיל את הפונקציה.
 */
const nodemailer = require("nodemailer");

const ZONE = "Asia/Jerusalem";

function nowStamp() {
  return new Date().toLocaleString("he-IL", { timeZone: ZONE });
}

async function sendTelegram(cfg, subject, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg.chat_id;
  if (!token) throw new Error("חסר TELEGRAM_BOT_TOKEN (secret)");
  if (!chatId) throw new Error("חסר chat_id בהגדרות telegram");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `${subject}\n${body}` }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Telegram HTTP ${res.status}: ${t}`);
  }
}

async function sendEmail(cfg, subject, body) {
  const pass = process.env.SMTP_PASS;
  const host = cfg.smtp_host;
  const port = Number(cfg.smtp_port || 587);
  const user = cfg.username || "";
  const from = cfg.from || user;
  const to = Array.isArray(cfg.to) ? cfg.to : (cfg.to ? [cfg.to] : []);
  if (!host || to.length === 0) throw new Error("חסר smtp_host או נמענים ל-Email");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  await transporter.sendMail({ from, to, subject, text: body });
}

const SENDERS = { telegram: sendTelegram, email: sendEmail };

/**
 * שולח לכל הערוצים שמסומנים enabled ב-settings.channels.
 * מחזיר מערך תוצאות [{channel, ok, error}] (שימושי לבדיקה ולוגים).
 */
async function dispatch(settings, subject, body) {
  const channels = (settings && settings.channels) || {};
  const results = [];
  for (const [name, fn] of Object.entries(SENDERS)) {
    const ch = channels[name];
    if (!ch || !ch.enabled) continue;
    try {
      await fn(ch, subject, body);
      results.push({ channel: name, ok: true, error: "" });
    } catch (e) {
      results.push({ channel: name, ok: false, error: String((e && e.message) || e) });
    }
  }
  if (results.length === 0) {
    results.push({ channel: "—", ok: false, error: "אין ערוצים פעילים" });
  }
  return results;
}

module.exports = { dispatch, nowStamp, sendTelegram, sendEmail };
