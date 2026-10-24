import { createClientFromRequest } from '../_shared/base44-compat.ts';

// Read-only inventory. Never mutate records in a preview.
const TYPES = ['Vehicle','Route','Driver','CompanyMembership','CompanyAccessGrant','Contact','KioskDevice','DriverSession'];
export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });
    const { company_id } = await req.json();
    if (typeof company_id !== 'string' || !company_id.trim()) return Response.json({ error: 'company_id required' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const company = await db.Company.get(company_id).catch(() => null);
    const counts: Record<string, number> = {};
    const errors: Record<string, string> = {};
    for (const type of TYPES) {
      try {
        let count = 0;
        let offset = 0;
        while (true) {
          const rows = await db[type].filter({ company_id }, '-created_date', 100, offset);
          count += rows.length;
          if (rows.length < 100) break;
          offset += rows.length;
          if (offset >= 10000) throw new Error('Preview limit reached');
        }
        counts[type] = count;
      } catch (e) { errors[type] = String((e as Error).message || e); }
    }
    return Response.json({ company_id, company_exists: !!company, counts, errors, safe_to_delete: false, read_only: true });
  } catch { return Response.json({ error: 'Could not preview company cleanup' }, { status: 500 }); }
}
