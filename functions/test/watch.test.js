/**
 * בדיקות ללוגיקת "אין תנועה" (noMovementDecision) — מקבילות ל-MovementWatchdog ב-elevator-rpi.
 * הרצה:  node test/watch.test.js   (נדרש luxon → npm install)
 */
const assert = require("assert");
const { DateTime } = require("luxon");
const { noMovementDecision } = require("../lib/watch");

const ZONE = "Asia/Jerusalem";
const OPTS = { thresholdHours: 10, nightStart: "23:00", nightEnd: "06:00" };

function ts(y, mo, d, h, mi = 0) {
  return DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: mi },
    { zone: ZONE }
  ).toSeconds();
}

const tests = {
  fires_once_after_threshold() {
    const move = ts(2026, 6, 21, 8);
    let prev = { last_ts: move, no_movement_alerted: false };

    let r = noMovementDecision(prev, move, ts(2026, 6, 21, 17), OPTS); // 9h יום
    assert.strictEqual(r.alert, false);
    prev = r.state;

    r = noMovementDecision(prev, move, ts(2026, 6, 21, 18, 30), OPTS); // 10.5h יום ⇒ יורה
    assert.strictEqual(r.alert, true);
    prev = r.state;

    r = noMovementDecision(prev, move, ts(2026, 6, 21, 20), OPTS); // כבר התריע
    assert.strictEqual(r.alert, false);
  },

  quiet_night_no_false_alarm() {
    // תנועה אחרונה 22:00, בדיקה ב-07:00 = 9h שמתוכן 7h לילה ⇒ 2h יום (< 10)
    const move = ts(2026, 6, 21, 22);
    const r = noMovementDecision(
      { last_ts: move, no_movement_alerted: false },
      move,
      ts(2026, 6, 22, 7),
      OPTS
    );
    assert.strictEqual(r.alert, false);
  },

  resets_on_movement() {
    const firstMove = ts(2026, 6, 21, 8);
    let r = noMovementDecision(
      { last_ts: firstMove, no_movement_alerted: false },
      firstMove,
      ts(2026, 6, 21, 19),
      OPTS
    );
    assert.strictEqual(r.alert, true); // 11h יום ⇒ יורה
    assert.strictEqual(r.state.no_movement_alerted, true);

    // תנועה חדשה (ts גדל) ⇒ איפוס האפיזודה, בלי התראה
    const newMove = ts(2026, 6, 21, 19);
    r = noMovementDecision(r.state, newMove, ts(2026, 6, 21, 20), OPTS);
    assert.strictEqual(r.alert, false);
    assert.strictEqual(r.state.no_movement_alerted, false);
  },

  first_seen_already_stale_fires() {
    // ריצה ראשונה (אין מצב קודם) ותנועה אחרונה כבר ישנה מהסף ⇒ יורה מיד
    const move = ts(2026, 6, 21, 6);
    const r = noMovementDecision(null, move, ts(2026, 6, 21, 18), OPTS); // 12h יום
    assert.strictEqual(r.alert, true);
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
