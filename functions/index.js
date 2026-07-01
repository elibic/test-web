/**
 * Cloud Functions - test-94822.
 *
 * ⚠️ ההתראות (כניסה/יציאה משבת, "אין תנועה") מנוהלות ב-Google Apps Script
 * (admin-dashboard/apps-script), *לא* כאן - כדי לא להריץ שתי שכבות במקביל
 * (התראות כפולות; ראה CLAUDE.md). לכן הקובץ הזה מכיל רק את extractTheme.
 * הלוגיקה הישנה של ההתראות נשמרת ב-lib/ (עם בדיקות) לעיון בלבד ואינה נפרסת.
 *
 * extractTheme - חילוץ ערכת-נושא (צבעים + גופנים) מכתובת אתר, עבור מסך
 * "מראה ומיתוג" ב-setup.html. onRequest עם cors:true, *בלי סודות* (כדי
 * שהפריסה לא תיגע ב-Secret Manager). דורש Blaze (רשת-יוצאת).
 * best-effort: סורק HTML + עד 4 גיליונות-סגנון.
 *
 * GET https://.../extractTheme?url=https://hotel.example.com
 *   ->  { colors:[{hex,n}], fonts:[...] }
 */
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const REGION = "us-central1";                 // תואם לאזור ה-RTDB

async function _fetchText(u, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
  try {
    const r = await fetch(u, { signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (ThemeExtractor)" } });
    return await r.text();
  } finally { clearTimeout(t); }
}
function _resolveUrl(href, base) { try { return new URL(href, base).href; } catch (e) { return null; } }
function _stylesheetUrls(html, base) {
  const out = []; const re = /<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi; let m;
  while ((m = re.exec(html))) {
    const h = /href=["']([^"']+)["']/i.exec(m[0]);
    if (h) { const u = _resolveUrl(h[1], base); if (u) out.push(u); }
  }
  return out;
}
function _topColors(text, limit) {
  const counts = {}; let m;
  const hexRe = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  while ((m = hexRe.exec(text))) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const hx = "#" + h; counts[hx] = (counts[hx] || 0) + 1;
  }
  const rgbRe = /rg(?:b|ba)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;
  while ((m = rgbRe.exec(text))) {
    const hx = "#" + [m[1], m[2], m[3]].map((n) => ("0" + Math.min(255, +n).toString(16)).slice(-2)).join("");
    counts[hx] = (counts[hx] || 0) + 1;
  }
  return Object.keys(counts).map((hex) => ({ hex, n: counts[hex] }))
    .sort((a, b) => b.n - a.n).slice(0, limit || 12);
}
function _topFonts(text, limit) {
  const counts = {}; const re = /font-family\s*:\s*([^;}{"']+)/gi; let m;
  while ((m = re.exec(text))) {
    const first = m[1].split(",")[0].replace(/['"]/g, "").trim();
    if (first && first.length < 40 && !/^(inherit|initial|unset|var\(|\d)/i.test(first)) {
      counts[first] = (counts[first] || 0) + 1;
    }
  }
  return Object.keys(counts).map((f) => ({ f, n: counts[f] }))
    .sort((a, b) => b.n - a.n).slice(0, limit || 6).map((x) => x.f);
}

exports.extractTheme = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) => {
    try {
      const url = String((req.query.url || (req.body && req.body.url) || "")).trim();
      if (!/^https?:\/\//i.test(url)) { res.status(400).json({ error: "URL לא תקין" }); return; }
      const html = await _fetchText(url, 8000);
      let blob = html;
      const cssUrls = _stylesheetUrls(html, url).slice(0, 4);
      for (const cu of cssUrls) { try { blob += "\n" + await _fetchText(cu, 6000); } catch (e) { /* skip */ } }
      res.json({ colors: _topColors(blob, 14), fonts: _topFonts(blob, 6) });
    } catch (e) {
      logger.error("extractTheme failed", e);
      res.status(500).json({ error: (e && e.message) || String(e) });
    }
  }
);
