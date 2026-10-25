import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Read-only inventory. Never mutate records in a preview.
const TYPES = ['Vehicle','Route','Driver','CompanyMembership','CompanyAccessGrant','Contact','KioskDevice','DeviceCredential','VerificationGrant','DriverPinCredential','NfcCard','User','CardHolder','PassengerAccessCredential','PassengerOneTimeCredential','PhoneUnlock'];
// History a removed company leaves behind. It gives no access to anything and
// is kept on purpose; an administrator can delete it from its own screen.
const HISTORY = ['Trip','Incident','Inspection','Broadcast','GroupMessage','Workplace','LostItemReport','Fault','DriverShift'];
export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });
    const { company_id, action } = await req.json();
    if (action === 'orphans') {
      const db = base44.asServiceRole.entities;
      const scan = async (type: string) => {
        const rows: any[] = [];
        for (let offset=0; offset<100000; offset+=500) {
          const page = await db[type].filter({}, 'id', 500, offset);
          rows.push(...page);
          if (page.length<500) return rows;
        }
        throw new Error('Inventory too large');
      };
      const companies = new Set((await scan('Company')).map(row=>row.id));
      const found: Record<string, {company_name: string, counts: Record<string, number>, history: Record<string, number>}> = {};
      const note = (row: any, type: string, list: 'counts' | 'history') => {
        if (!row.company_id || companies.has(row.company_id)) return;
        const entry = found[row.company_id] ||= { company_name: '', counts: {}, history: {} };
        if (!entry.company_name && typeof row.company_name === 'string') entry.company_name = row.company_name.trim().slice(0, 120);
        entry[list][type] = (entry[list][type] || 0) + 1;
      };
      for (const type of TYPES) for (const row of await scan(type)) {
        if ((type==='CompanyMembership' && !row.active) || (type==='DriverPinCredential' && !row.enabled) || (type==='NfcCard' && row.is_active===false)) continue;
        note(row, type, 'counts');
      }
      // History is a nice-to-know: a list that can't be read is left out.
      for (const type of HISTORY) {
        const rows = await scan(type).catch(() => []);
        for (const row of rows) note(row, type, 'history');
      }
      return Response.json({orphans:Object.entries(found).map(([company_id,entry])=>({company_id,...entry})),read_only:true});
    }
    if (typeof company_id !== 'string' || !company_id.trim()) return Response.json({ error: 'company_id required' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    const company = await db.Company.get(company_id).catch(error => { if (error.status === 404) return null; throw error; });
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
