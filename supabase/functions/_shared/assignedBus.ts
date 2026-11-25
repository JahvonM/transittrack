import { retry429 } from './retry429.ts';

// The bus a passenger rides in one company, as the office set it (nfcCards
// set_bus keeps both records on the same bus): their directory card (Contact)
// if they have one, otherwise their app membership. The passenger app's
// "my bus" (companyAccess) and what a passenger may see of the buses
// (entityAccess) both come from here, so they always agree.
export async function assignedBusId(db: any, user: any, companyId: string): Promise<string> {
 if (!companyId || !['staff', 'passenger'].includes(user?.role)) return '';
 const email = String(user.email || '').trim();
 const lower = email.toLowerCase();
 const cards: any[] = [];
 for (const value of [...new Set([email, lower])].filter(Boolean)) {
  cards.push(...await retry429(async () => db.Contact.filter({ company_id: companyId, email: value }, '-updated_date', 10)));
 }
 const card = cards.find((c) => c.company_id === companyId && String(c.email || '').trim().toLowerCase() === lower && (!c.type || ['staff', 'passenger'].includes(c.type)));
 if (card) return card.vehicle_id || '';
 const rows = await retry429(async () => db.CompanyMembership.filter({ user_id: user.id, company_id: companyId, scope: 'passenger', active: true }, '-updated_date', 100));
 return rows.find((r: any) => r.company_id === companyId && r.vehicle_id)?.vehicle_id || '';
}
