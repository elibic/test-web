/**
 * בדיקות לחישוב "שניות יום" (החרגת לילה) — מקבילות לבדיקות ב-elevator-rpi.
 * הרצה:  node test/night.test.js   (אחרי npm install — נדרש luxon)
 */
const assert = require("assert");
const { DateTime } = require("luxon");
const { daytimeSecondsBetween, nightSecondsBetween } = require("../lib/night");

const H = 3600;
const ZONE = "Asia/Jerusalem";

// זמן מקומי (Asia/Jerusalem) → epoch-seconds
function ts(y, mo, d, h, mi = 0) {
  return DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: mi },
    { zone: ZONE }
  ).toSeconds();
}

const tests = {
  daytime_fully_in_day() {
    const s = ts(2026, 6, 21, 10), e = ts(2026, 6, 21, 14);
    assert.ok(Math.abs(daytimeSecondsBetween(s, e) - 4 * H) < 1);
  },
  daytime_fully_in_night() {
    const s = ts(2026, 6, 21, 0), e = ts(2026, 6, 21, 5);
    assert.strictEqual(daytimeSecondsBetween(s, e), 0);
  },
  daytime_crossing_night() {
    // 22:00 → 08:00 למחרת = 10h; לילה 23:00–06:00 = 7h ⇒ יום = 3h
    const s = ts(2026, 6, 21, 22), e = ts(2026, 6, 22, 8);
    assert.ok(Math.abs(daytimeSecondsBetween(s, e) - 3 * H) < 1, "daytime≈3h");
    assert.ok(Math.abs(nightSecondsBetween(s, e) - 7 * H) < 1, "night≈7h");
  },
  no_night_when_equal() {
    const s = ts(2026, 6, 21, 0), e = ts(2026, 6, 22, 0);
    assert.strictEqual(nightSecondsBetween(s, e, "00:00", "00:00"), 0);
  },
  quiet_night_under_threshold() {
    // 22:00 → 07:00 = 9h, מתוכן 7h לילה ⇒ רק 2h יום (< סף 10)
    const s = ts(2026, 6, 21, 22), e = ts(2026, 6, 22, 7);
    assert.ok(daytimeSecondsBetween(s, e) < 10 * H);
    assert.ok(Math.abs(daytimeSecondsBetween(s, e) - 2 * H) < 1);
  },
  full_day_minus_night() {
    // יממה שלמה = 24h, לילה 23:00–06:00 = 7h ⇒ יום = 17h
    const s = ts(2026, 6, 21, 0), e = ts(2026, 6, 22, 0);
    assert.ok(Math.abs(daytimeSecondsBetween(s, e) - 17 * H) < 1);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}
const total = Object.keys(tests).length;
console.log(`\n${total - failed}/${total} עברו`);
process.exit(failed ? 1 : 0);
