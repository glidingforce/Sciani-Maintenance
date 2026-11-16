import type { DateOnly } from '../types';

/** The app's working time zone. Israel observes daylight saving time; all
 * conversions go through Intl with this zone so the browser's own zone and
 * DST transitions never shift a date. */
export const APP_TIME_ZONE = 'Asia/Jerusalem';
/** Windows name of the same zone, used with Microsoft Graph. */
export const GRAPH_TIME_ZONE = 'Israel Standard Time';

function parts(date: Date, timeZone = APP_TIME_ZONE) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in the app zone. */
export function todayISO(now: Date = new Date()): DateOnly {
  const p = parts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Add whole days to a date-only value (calendar arithmetic, no DST effect). */
export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Offset of the app zone from UTC, in minutes, at a given instant. */
export function zoneOffsetMinutes(instant: Date, timeZone = APP_TIME_ZONE): number {
  const p = parts(instant, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant of a wall-clock time in the app zone (handles DST). */
export function zonedToUtc(date: DateOnly, time = '00:00', timeZone = APP_TIME_ZONE): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle correctly across a DST boundary.
  let ts = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  ts = guess - zoneOffsetMinutes(new Date(ts), timeZone) * 60000;
  return new Date(ts);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "18 Nov" (adds the year when it differs from today's). */
export function shortDate(date: DateOnly, today: DateOnly = todayISO()): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}

/** "Monday · 16 November" */
export function longDate(date: DateOnly): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `${WEEKDAYS[wd]} · ${d} ${month}`;
}

/** Relative wording used in rows: Today, Tomorrow, Yesterday, or a short date. */
export function relativeDate(date: DateOnly, today: DateOnly = todayISO()): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  return shortDate(date, today);
}

export function greeting(now: Date = new Date()): string {
  const h = parts(now).hour;
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Formats a Graph wall-clock dateTime ("2026-11-18T09:00:00.0000000") as "09:00". */
export function wallClockTime(dateTime: string): string {
  return dateTime.slice(11, 16);
}

export function wallClockDate(dateTime: string): DateOnly {
  return dateTime.slice(0, 10);
}
