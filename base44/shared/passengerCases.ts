// Passenger requests and support cases: one list with a reference number,
// a status and replies, shared by the passenger app, the office inbox and the
// server (passengerCases).

export const CASE_KINDS = [
  // Changes the office confirms or turns down.
  'time_change', 'pickup_change', 'cancel_ride',
  // Problems the office looks into.
  'missed_pickup', 'card_issue', 'booking_issue', 'other',
  // Optional, after a ride.
  'feedback',
] as const;
export type CaseKind = typeof CASE_KINDS[number];

export const CHANGE_KINDS: readonly CaseKind[] = ['time_change', 'pickup_change', 'cancel_ride'];
export const isChange = (kind: string) => (CHANGE_KINDS as readonly string[]).includes(kind);

export const CASE_STATUSES = ['requested', 'pending', 'confirmed', 'rejected', 'resolved', 'closed'] as const;
export type CaseStatus = typeof CASE_STATUSES[number];
export const OPEN_STATUSES: readonly CaseStatus[] = ['requested', 'pending'];
export const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);
// What the office can set. Confirmed / rejected are for changes, resolved for problems.
export const officeStatuses = (kind: string): CaseStatus[] =>
  isChange(kind) ? ['pending', 'confirmed', 'rejected', 'closed'] : ['pending', 'resolved', 'closed'];

export const CASE_KIND_TEXT: Record<CaseKind, string> = {
  time_change: 'Change my pickup time',
  pickup_change: 'Change my pickup place',
  cancel_ride: 'Cancel a ride',
  missed_pickup: 'Missed pickup',
  card_issue: 'Card problem',
  booking_issue: 'Booking problem',
  other: 'Something else',
  feedback: 'Ride feedback',
};

// Said to the passenger.
export function caseStatusText(kind: string, status: string) {
  if (kind === 'feedback') return status === 'closed' || status === 'resolved' ? 'Thank you' : 'Received';
  return ({
    requested: 'Sent', pending: 'Being looked at', confirmed: 'Confirmed', rejected: 'Not possible',
    resolved: 'Sorted', closed: 'Closed',
  } as Record<string, string>)[status] || 'Sent';
}

const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
export function newReference(random: (n: number) => Uint8Array) {
  const bytes = random(6);
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return 'TT-' + out;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F<>]/g, '').trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// A passenger's new request, checked. Returns { data } or { error }.
export function readCaseRequest(body: any, today: string) {
  const kind = String(body?.kind || '');
  if (!(CASE_KINDS as readonly string[]).includes(kind)) return { error: 'Choose what the request is about.' };
  const details = clean(body?.details, 1000);
  const data: Record<string, unknown> = { kind, details };
  if (kind === 'feedback') {
    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Choose a rating from 1 to 5.' };
    data.rating = rating;
    return { data };
  }
  if (isChange(kind)) {
    const date = String(body?.requested_date || '');
    if (!DATE.test(date) || date < today) return { error: 'Choose the day this is for (today or later).' };
    data.requested_date = date;
    if (kind === 'time_change') {
      const time = String(body?.requested_time || '');
      if (!TIME.test(time)) return { error: 'Choose the pickup time you would like.' };
      data.requested_time = time;
    }
    if (kind === 'pickup_change') {
      const place = clean(body?.requested_pickup, 160);
      if (place.length < 3) return { error: 'Say where you would like to be picked up.' };
      data.requested_pickup = place;
    }
  } else if (details.length < 3) {
    return { error: 'Tell us briefly what happened.' };
  }
  return { data };
}

// One reply in a case's thread.
export const readReply = (text: unknown) => {
  const t = clean(text, 1000);
  return t.length ? t : null;
};
