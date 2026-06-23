/**
 * night.js — חישוב "שניות יום בלבד" (החרגת חלון לילה), מודע לאזור-זמן (Asia/Jerusalem).
 *
 * נמל מ-shabbat_detector/notifier.py (elevator-rpi) כדי לשמור על אותה התנהגות,
 * אבל כאן ב-TZ קבוע של ישראל (כי Cloud Functions רצות ב-UTC) ועם תמיכת DST דרך luxon.
 */
const { DateTime } = require("luxon");

const ZONE = "Asia/Jerusalem";

function parseHHMM(s) {
  const parts = String(s == null ? "00:00" : s).split(":");
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return { h, m };
}

/**
 * כמה שניות בקטע [start, end] (epoch-seconds) נופלות בתוך חלון הלילה המקומי.
 * תומך בחלון שחוצה חצות (למשל 23:00→06:00).
 */
function nightSecondsBetween(start, end, nightStart = "23:00", nightEnd = "06:00") {
  if (end <= start) return 0;
  const ns = parseHHMM(nightStart);
  const ne = parseHHMM(nightEnd);
  if (ns.h === ne.h && ns.m === ne.m) return 0; // אין חלון לילה מוגדר

  let total = 0;
  // מתחילים מחצות-מקומי של היום שלפני start, כדי לתפוס לילה שהתחיל "אתמול".
  let day = DateTime.fromSeconds(start, { zone: ZONE }).startOf("day").minus({ days: 1 });

  while (day.toSeconds() < end) {
    const a = day.set({ hour: ns.h, minute: ns.m, second: 0, millisecond: 0 });
    let b = day.set({ hour: ne.h, minute: ne.m, second: 0, millisecond: 0 });
    if (b <= a) b = b.plus({ days: 1 }); // חלון חוצה חצות

    const lo = Math.max(a.toSeconds(), start);
    const hi = Math.min(b.toSeconds(), end);
    if (hi > lo) total += hi - lo;

    day = day.plus({ days: 1 });
  }
  return total;
}

/** שניות-יום בלבד שחלפו בין start ל-end (מחסיר את חלון הלילה). */
function daytimeSecondsBetween(start, end, nightStart = "23:00", nightEnd = "06:00") {
  return Math.max(0, (end - start) - nightSecondsBetween(start, end, nightStart, nightEnd));
}

module.exports = { nightSecondsBetween, daytimeSecondsBetween, ZONE };
