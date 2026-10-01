// Wall-clock formatting for activity summaries. The hooks runtime (goja) has no Intl, but
// PocketBase's DateTime can parse a wall-clock time in an IANA zone, which is enough to derive
// the zone's offset at an instant. Unknown zones behave as UTC.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 'YYYY-MM-DD HH:MM:SS' of `ms` read as a UTC wall clock. */
function wall(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** The instant (ms) whose wall clock in `timeZone` reads `wallClock`. */
function instantOfWall(wallClock, timeZone) {
  return new DateTime(wallClock, timeZone).unix() * 1000;
}

/** Offset of `timeZone` from UTC at instant `ms`, in minutes (Los Angeles in summer: -420). */
function offsetMinutes(ms, timeZone) {
  const whole = Math.floor(ms / 1000) * 1000;
  let offset = whole - instantOfWall(wall(whole), timeZone);
  // Second pass: correct the guess near daylight saving transitions.
  offset += whole - instantOfWall(wall(whole + offset), timeZone);
  return Math.round(offset / 60000);
}

/** PocketBase ('2025-05-16 15:00:00.000Z') or ISO instant → { day: 'YYYY-MM-DD', clock: '8:00' }. */
function zoned(instant, timeZone) {
  if (!instant) return null;
  const ms = Date.parse(String(instant).replace(' ', 'T'));
  if (isNaN(ms)) return null;
  let offset = 0;
  try {
    offset = offsetMinutes(ms, timeZone || 'UTC');
  } catch (_) {
    offset = 0;
  }
  const d = new Date(ms + offset * 60000);
  return {
    day: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()),
    clock: d.getUTCHours() + ':' + pad(d.getUTCMinutes()),
  };
}

/** 'YYYY-MM-DD' → 'Sat, May 17'. */
function dayWords(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return String(day || '');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return WEEKDAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

module.exports = { zoned, dayWords, offsetMinutes };
