// A passenger's regular days off ("I don't ride on Fridays"), asked for in
// the app and approved by the office (passengerCases). Once approved it lives
// on the passenger's account as `ride_pattern`, and on those days they are
// left off the driver's lists the same way "Skip today" does. Only the
// server sets it: passengers can't write it themselves.
//
// A pattern: { days: [0-6] (0 = Sunday), direction: 'both' | 'to_work' |
// 'to_home', from: 'YYYY-MM-DD', until: 'YYYY-MM-DD' | '', reference, case_id }

export const PATTERN_DIRECTIONS = ['both', 'to_work', 'to_home'] as const;
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PATTERN_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The transit day and weekday (Grenada time) for a moment.
export function transitDay(at: number) {
  const day = new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Grenada' });
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  return { day, weekday };
}

// A passenger's request, checked. Returns { pattern } or { error }.
export function readPattern(body: any, today: string) {
  const days = [...new Set((Array.isArray(body?.days) ? body.days : []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) return { error: 'Choose the days you won’t ride.' };
  if (days.length === 7) return { error: 'Choose at most six days. To stop riding altogether, message the office.' };
  const direction = (PATTERN_DIRECTIONS as readonly string[]).includes(body?.direction) ? body.direction : 'both';
  const from = String(body?.requested_date || '');
  if (!PATTERN_DATE.test(from) || from < today) return { error: 'Choose the day this starts (today or later).' };
  const until = String(body?.until_date || '');
  if (until && (!PATTERN_DATE.test(until) || until < from)) return { error: 'The end date must be on or after the start date.' };
  return { pattern: { days, direction, from, until } };
}

// Whether an approved pattern takes the passenger off the bus at `now` for a
// trip in `direction` ('to_work' / 'to_home'; anything else = either).
export function patternSkips(pattern: any, now = Date.now(), direction = '') {
  if (!pattern || !Array.isArray(pattern.days) || !pattern.days.length) return false;
  const { day, weekday } = transitDay(now);
  if (pattern.from && day < pattern.from) return false;
  if (pattern.until && day > pattern.until) return false;
  if (!pattern.days.includes(weekday)) return false;
  if (pattern.direction === 'to_work' && direction === 'to_home') return false;
  if (pattern.direction === 'to_home' && direction === 'to_work') return false;
  return true;
}

// In words, e.g. "Not riding on Fridays (both ways) from 2026-11-06".
export function patternText(pattern: any) {
  if (!pattern?.days?.length) return '';
  const names = pattern.days.map((d: number) => WEEKDAY_NAMES[d] + 's');
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0];
  const way = pattern.direction === 'to_work' ? 'to work only' : pattern.direction === 'to_home' ? 'home only' : 'both ways';
  return `Not riding on ${list} (${way}) from ${pattern.from}${pattern.until ? ` until ${pattern.until}` : ''}`;
}
