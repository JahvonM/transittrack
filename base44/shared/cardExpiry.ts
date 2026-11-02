import { cardEmail, sendAccountEmail } from './accountEmails.ts';

// Bus cards with an end date: the holder gets one email when the card has
// CARD_EXPIRY_NOTICE_DAYS or fewer left (Admin → Notifications → Bus card
// ending soon). Run each morning from maintenanceAlerts, the daily job, so no
// new schedule is needed. A card is told once per end date
// (NfcCard.expiry_notice_for), so a renewed card with a new date is told again.

export const CARD_EXPIRY_NOTICE_DAYS = 14;
const cardDayOf = (at: number) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Grenada' });

// Who holds a card and where to write to them.
export async function cardHolderOf(sr: any, card: any) {
  const holder = card.holder_source === 'contact' ? await sr.Contact.get(card.holder_id).catch(() => null)
    : card.holder_source === 'user' ? await sr.User.get(card.holder_id).catch(() => null)
      : card.holder_source === 'driver' ? await sr.Driver.get(card.holder_id).catch(() => null) : null;
  return { email: holder?.email || '', name: card.holder_name || holder?.full_name || holder?.name || '' };
}

export async function remindExpiringCards(base44: any, now = Date.now()) {
  const sr = base44.asServiceRole.entities;
  const today = cardDayOf(now);
  const last = cardDayOf(now + CARD_EXPIRY_NOTICE_DAYS * 86400_000);
  const cards = await sr.NfcCard.filter({ is_active: true }, '-updated_date', 5000).catch(() => []);
  let due = 0, sent = 0;
  for (const card of cards) {
    const end = String(card.expiry_date || '').slice(0, 10);
    if (!card.is_active || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today || end > last || card.expiry_notice_for === end) continue;
    due++;
    const holder = await cardHolderOf(sr, card);
    const result = await sendAccountEmail(base44, 'card_expiring', holder.email,
      cardEmail({ name: holder.name, event: 'expiring', uid: card.card_uid, until: end }), { companyId: card.company_id || '' });
    // Sent, held back, or no address: done for this end date. A failed send
    // is tried again tomorrow.
    if (!result.failed) await sr.NfcCard.update(card.id, { expiry_notice_for: end }).catch(() => {});
    if (result.sent) sent++;
  }
  return { due, sent };
}
