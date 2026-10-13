import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { retry429 } from '../../shared/retry429.ts';

// Admin → Completed & billing: invoices for clients (hotels, companies) from
// their finished, priced jobs, and the signatures given on the driver tablet,
// which are private files. Administrators only.

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ZONE = 'America/Grenada';
const MAX_SIGNATURE_BYTES = 1024 * 1024;

function zoneOf(value) {
  if (typeof value !== 'string' || !value) return DEFAULT_ZONE;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return value; } catch { return DEFAULT_ZONE; }
}
// How far a time zone is ahead of UTC at a moment, in ms.
function zoneOffsetMs(at, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(at / 1000) * 1000;
}
// The first moment of a calendar day in a time zone.
function dayStart(date, zone) {
  const guess = Date.parse(date + 'T00:00:00Z');
  return guess - zoneOffsetMs(guess, zone);
}
function nextDay(date) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function localDate(iso, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

async function allRows(db, name, query, sort = '-created_date') {
  const rows = [];
  for (let skip = 0; skip < 20000; skip += 500) {
    const batch = await retry429(() => db[name].filter(query, sort, 500, skip));
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

function jobLabel(trip) {
  const type = { airport_pickup: 'Airport pickup', airport_dropoff: 'Airport drop-off', hotel_tour: 'Hotel tour', staff_run: 'Staff run' }[trip.job_type] || 'Transfer';
  const route = [trip.pickup_name, trip.dropoff_name].filter(Boolean).join(' to ');
  const extra = [trip.flight_number && `flight ${trip.flight_number}`, trip.guests ? `${trip.guests} guest${trip.guests === 1 ? '' : 's'}` : '', trip.passenger_name].filter(Boolean).join(', ');
  return [type, route].filter(Boolean).join(': ') + (extra ? ` (${extra})` : '');
}

// The client's finished, priced jobs in the period that are on no invoice yet.
// A job on an invoice that was not voided is left out even if its invoice mark
// was never written (the invoice itself is what counts).
async function billable(db, clientId, from, to, zone) {
  if (!DATE.test(from) || !DATE.test(to) || from > to) fail(400, 'Choose a valid period');
  if (Date.parse(to) - Date.parse(from) > 400 * 86400_000) fail(400, 'Choose a period of up to a year');
  const start = dayStart(from, zone), end = dayStart(nextDay(to), zone);
  const [trips, invoices] = await Promise.all([
    allRows(db, 'Trip', { client_id: clientId, status: 'completed' }, '-completed_at'),
    allRows(db, 'Invoice', { client_id: clientId }),
  ]);
  const invoiced = new Set(invoices.filter((i) => i.status !== 'void').flatMap((i) => (i.lines || []).map((l) => l.trip_id)));
  const inPeriod = trips.filter((t) => {
    const at = Date.parse(t.completed_at || t.scheduled_time || '');
    return Number.isFinite(at) && at >= start && at < end && !invoiced.has(t.id);
  });
  return {
    jobs: inPeriod.filter((t) => Number.isFinite(Number(t.price)) && t.price !== null && t.price !== ''),
    unpriced: inPeriod.filter((t) => !(Number.isFinite(Number(t.price)) && t.price !== null && t.price !== '')),
  };
}

// One invoice per company that did the jobs and per currency.
function groups(jobs, zone) {
  const out = new Map();
  for (const t of [...jobs].sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)))) {
    const currency = t.currency || 'XCD';
    const key = (t.company_id || '') + '|' + currency;
    if (!out.has(key)) out.set(key, { company_id: t.company_id || '', company_name: t.company_name || '', currency, lines: [], total: 0 });
    const group = out.get(key);
    const amount = Math.round(Number(t.price) * 100) / 100;
    group.lines.push({ trip_id: t.id, date: localDate(t.completed_at || t.scheduled_time, zone), description: jobLabel(t).slice(0, 300), amount });
    group.total = Math.round((group.total + amount) * 100) / 100;
  }
  return [...out.values()];
}

// Invoice numbers run per year: INV-2026-0001. Checked against what exists so
// two invoices never share a number.
async function nextNumber(db, year, taken) {
  const rows = await allRows(db, 'Invoice', {});
  const used = new Set([...rows.map((r) => r.number), ...taken]);
  let n = rows.filter((r) => String(r.number || '').startsWith(`INV-${year}-`)).length + 1;
  while (used.has(`INV-${year}-${String(n).padStart(4, '0')}`)) n++;
  return `INV-${year}-${String(n).padStart(4, '0')}`;
}

async function loadClient(db, id) {
  if (!id || typeof id !== 'string') fail(400, 'Choose a client');
  const client = await db.Client.get(id).catch((e) => { if ([400, 404].includes(e?.status ?? e?.response?.status)) return null; throw e; });
  if (!client) fail(404, 'Client not found');
  return client;
}
async function loadInvoice(db, id) {
  if (!id || typeof id !== 'string') fail(400, 'invoice_id required');
  const invoice = await db.Invoice.get(id).catch((e) => { if ([400, 404].includes(e?.status ?? e?.response?.status)) return null; throw e; });
  if (!invoice) fail(404, 'Invoice not found');
  return invoice;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
// A private signature as a picture the browser can show and put in a PDF
// without the file's link ever leaving the server.
async function signatureImage(base44, uri) {
  if (!uri) return null;
  const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 60 });
  if (!signed?.signed_url) return null;
  const res = await fetch(signed.signed_url);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SIGNATURE_BYTES) return null;
  return 'data:image/png;base64,' + bytesToBase64(bytes);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const session = await base44.auth.me().catch((e) => { const s = e?.status ?? e?.response?.status; if (s === 401 || s === 403) return null; throw e; });
    if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
    // Current role from the stored record, not from the session token.
    const user = await base44.asServiceRole.entities.User.get(session.id).catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Administrators only' }, { status: 403 });
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const zone = zoneOf(body.time_zone);

    switch (body.action) {
      case 'preview_invoice': {
        await loadClient(db, body.client_id);
        const { jobs, unpriced } = await billable(db, body.client_id, body.from, body.to, zone);
        return Response.json({ invoices: groups(jobs, zone), unpriced: unpriced.length });
      }

      case 'create_invoice': {
        const client = await loadClient(db, body.client_id);
        const { jobs } = await billable(db, body.client_id, body.from, body.to, zone);
        if (!jobs.length) fail(400, 'There are no finished, priced jobs to invoice in this period');
        const dueDays = Number.isInteger(Number(body.due_days)) && Number(body.due_days) >= 0 && Number(body.due_days) <= 365 ? Number(body.due_days) : 30;
        const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
        const issued = new Date();
        const today = localDate(issued.toISOString(), zone);
        const due = new Date(today + 'T12:00:00Z'); due.setUTCDate(due.getUTCDate() + dueDays);
        const created = [], taken = [];
        for (const group of groups(jobs, zone)) {
          const number = await nextNumber(db, today.slice(0, 4), taken);
          taken.push(number);
          const invoice = await retry429(() => db.Invoice.create({
            company_id: group.company_id, company_name: group.company_name,
            client_id: client.id, client_name: client.name, client_email: client.email || '', client_address: client.address || '',
            number, period_start: body.from, period_end: body.to, issued_at: issued.toISOString(), due_date: due.toISOString().slice(0, 10),
            lines: group.lines, total: group.total, currency: group.currency, status: 'draft', notes,
          }));
          // The job list shows which invoice each job is on.
          for (const line of group.lines) await retry429(() => db.Trip.update(line.trip_id, { invoice_id: invoice.id, invoice_number: number }));
          created.push(invoice);
        }
        return Response.json({ invoices: created });
      }

      case 'set_invoice_status': {
        const invoice = await loadInvoice(db, body.invoice_id);
        if (!['draft', 'sent', 'paid'].includes(body.status)) fail(400, 'Invalid status');
        if (invoice.status === 'void') fail(409, 'This invoice was voided');
        const now = new Date().toISOString();
        const update = { status: body.status };
        if (body.status === 'sent') update.sent_at = invoice.sent_at || now;
        if (body.status === 'paid') update.paid_at = now;
        if (body.status !== 'paid') update.paid_at = null;
        return Response.json({ invoice: await retry429(() => db.Invoice.update(invoice.id, update)) });
      }

      case 'void_invoice': {
        // Its jobs can go on a new invoice.
        const invoice = await loadInvoice(db, body.invoice_id);
        if (invoice.status === 'void') return Response.json({ invoice });
        const updated = await retry429(() => db.Invoice.update(invoice.id, { status: 'void', voided_at: new Date().toISOString() }));
        for (const line of invoice.lines || []) {
          const trip = await db.Trip.get(line.trip_id).catch(() => null);
          if (trip?.invoice_id === invoice.id) await retry429(() => db.Trip.update(trip.id, { invoice_id: '', invoice_number: '' }));
        }
        return Response.json({ invoice: updated });
      }

      case 'signatures': {
        if (!body.trip_id || typeof body.trip_id !== 'string') fail(400, 'trip_id required');
        const trip = await db.Trip.get(body.trip_id).catch((e) => { if ([400, 404].includes(e?.status ?? e?.response?.status)) return null; throw e; });
        if (!trip) fail(404, 'Job not found');
        const [pickup, dropoff] = await Promise.all([
          signatureImage(base44, trip.pickup_signature_uri).catch(() => null),
          signatureImage(base44, trip.dropoff_signature_uri).catch(() => null),
        ]);
        // Jobs signed before signatures were private keep their old link.
        return Response.json({ pickup: pickup || trip.pickup_signature_url || null, dropoff: dropoff || trip.dropoff_signature_url || null });
      }

      default:
        fail(400, 'Unknown action');
    }
  } catch (error) {
    const status = Number(error?.status ?? error?.response?.status) || 500;
    return Response.json({ error: status < 500 && error?.message ? error.message : 'Billing request failed' }, { status: status >= 400 && status <= 599 ? status : 500 });
  }
}
