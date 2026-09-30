// Time helpers. Deterministic: every function takes its inputs; nothing reads the clock.
// Instants are ISO 8601 UTC strings; days are 'YYYY-MM-DD'; wall times are 'HH:mm' (24 h).

const MINUTE = 60_000;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid instant: ${iso}`);
  return ms;
}

/** Whole minutes from a to b (b − a), rounded to the nearest minute. */
export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((toMs(bIso) - toMs(aIso)) / MINUTE);
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(toMs(iso) + minutes * MINUTE).toISOString();
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `timeZone` from UTC at instant `ms`, in minutes (LA in summer: −420). */
function offsetMinutes(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
}

/** Wall-clock day and time in `timeZone` → ISO instant. `zonedToInstant('2025-05-16','08:00','America/Los_Angeles')` → '2025-05-16T15:00:00.000Z'. */
export function zonedToInstant(day: string, hhmm: string, timeZone: string): string {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error(`Invalid day/time: ${day} ${hhmm}`);
  }
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Two passes handle DST transitions.
  let ms = guess - offsetMinutes(guess, timeZone) * MINUTE;
  ms = guess - offsetMinutes(ms, timeZone) * MINUTE;
  return new Date(ms).toISOString();
}

/** ISO instant → wall-clock day ('YYYY-MM-DD') and time ('HH:mm') in `timeZone`. */
export function instantToZoned(iso: string, timeZone: string): { day: string; time: string } {
  const p = zonedParts(toMs(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** '08:16' → '8:16'; '13:04' → '1:04 PM' when twelveHour. Used by messages and print. */
export function formatClock(hhmm: string, twelveHour = false): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  if (!twelveHour) return `${h}:${String(m).padStart(2, '0')}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Wall time of an instant in the zone, formatted like '9:52'. */
export function clockAt(iso: string, timeZone: string, twelveHour = false): string {
  return formatClock(instantToZoned(iso, timeZone).time, twelveHour);
}

/** Inclusive list of days from start to end ('YYYY-MM-DD'). */
export function daysBetween(startDay: string, endDay: string): string[] {
  const out: string[] = [];
  let ms = Date.parse(`${startDay}T00:00:00Z`);
  const end = Date.parse(`${endDay}T00:00:00Z`);
  if (Number.isNaN(ms) || Number.isNaN(end)) return out;
  while (ms <= end && out.length < 60) {
    out.push(new Date(ms).toISOString().slice(0, 10));
    ms += 24 * 60 * MINUTE;
  }
  return out;
}
