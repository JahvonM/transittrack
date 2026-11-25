import { retry429 } from './retry429.ts';

// The bus a passenger rides in one company, as the office set it (nfcCards
// set_bus keeps both records on the same bus): their directory card (Contact)
// if they have one, otherwise their app membership. The passenger app's
// "my bus" (companyAccess) and what a passenger may see of the buses
// (entityAccess) both come from here, so they always agree.
async function directoryCard(db: any, user: any, companyId: string): Promise<any> {
 const email = String(user.email || '').trim();
 const lower = email.toLowerCase();
 const cards: any[] = [];
 for (const value of [...new Set([email, lower])].filter(Boolean)) {
  cards.push(...await retry429(async () => db.Contact.filter({ company_id: companyId, email: value }, '-updated_date', 10)));
 }
 return cards.find((c) => c.company_id === companyId && String(c.email || '').trim().toLowerCase() === lower && (!c.type || ['staff', 'passenger'].includes(c.type))) || null;
}

export async function assignedBusId(db: any, user: any, companyId: string): Promise<string> {
 if (!companyId || !['staff', 'passenger'].includes(user?.role)) return '';
 const card = await directoryCard(db, user, companyId);
 if (card) return card.vehicle_id || '';
 const rows = await retry429(async () => db.CompanyMembership.filter({ user_id: user.id, company_id: companyId, scope: 'passenger', active: true }, '-updated_date', 100));
 return rows.find((r: any) => r.company_id === companyId && r.vehicle_id)?.vehicle_id || '';
}

// A pickup spot set for someone on a sign-up day, before they had joined in
// the app, is saved on their directory card only; the passenger app reads it
// from their account, so they were still asked to choose a pickup. Copy the
// card's spot onto the account when the account has none yet (a spot the
// person chose themselves is never replaced). true when it was copied.
export async function adoptCardPickup(db: any, user: any, companyId: string): Promise<boolean> {
 if (!companyId || !['staff', 'passenger'].includes(user?.role)) return false;
 if (user.pickup_lat != null && user.pickup_lng != null) return false;
 const card = await directoryCard(db, user, companyId);
 const lat = Number(card?.pickup_lat), lng = Number(card?.pickup_lng);
 if (card?.pickup_lat == null || card?.pickup_lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
 const account = await retry429(async () => db.User.get(user.id)).catch(() => null);
 if (!account || (account.pickup_lat != null && account.pickup_lng != null)) return false;
 await retry429(async () => db.User.update(user.id, { pickup_name: String(card.pickup_name || '').slice(0, 120), pickup_lat: lat, pickup_lng: lng, pickup_route_id: '' }));
 return true;
}
