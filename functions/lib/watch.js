/**
 * watch.js — לוגיקת "אין תנועה" כפונקציה טהורה (ללא DB), מקבילה ל-MovementWatchdog ב-Python.
 *
 * מקבל את המצב הקודם (last_ts, no_movement_alerted) ואת זמן-התנועה-האחרון, ומחזיר
 * האם להתריע + המצב המעודכן לשמירה. יורה פעם אחת לכל אפיזודה; מתאפס כשמתגלה תנועה חדשה.
 */
const { daytimeSecondsBetween } = require("./night");

/**
 * @param {{last_ts?:number, no_movement_alerted?:boolean}|null} prev מצב קודם (מ-/notify_state/{id})
 * @param {number} ts    זמן התנועה האחרון (epoch-seconds) — elevators/{id}/timestamp
 * @param {number} now   עכשיו (epoch-seconds)
 * @param {{thresholdHours:number, nightStart:string, nightEnd:string}} opts
 * @returns {{alert:boolean, state:{last_ts:number, no_movement_alerted:boolean}}}
 */
function noMovementDecision(prev, ts, now, opts) {
  const thresholdHours = Number(opts.thresholdHours != null ? opts.thresholdHours : 10);
  const nightStart = opts.nightStart || "23:00";
  const nightEnd = opts.nightEnd || "06:00";

  let alerted = !!(prev && prev.no_movement_alerted);
  const lastTs = (prev && prev.last_ts) || 0;
  if (ts > lastTs) alerted = false; // זוהתה תנועה ⇒ איפוס האפיזודה

  let alert = false;
  const daytime = daytimeSecondsBetween(ts, now, nightStart, nightEnd);
  if (!alerted && daytime >= thresholdHours * 3600) {
    alert = true;
    alerted = true;
  }
  return { alert, state: { last_ts: ts, no_movement_alerted: alerted } };
}

module.exports = { noMovementDecision };
