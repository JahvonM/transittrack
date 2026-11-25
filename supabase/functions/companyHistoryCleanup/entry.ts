import { createClientFromRequest } from '../_shared/base44-compat.ts';

// Admin → Companies → Find records from removed companies: delete the history
// a removed company left behind (old jobs, faults, messages...), only the kinds
// the administrator ticked. History gives no access to anything; it is kept
// until someone deletes it. Records still linked to the company (buses,
// drivers, logins) are not touched here: Recover records keeps those.
//
//   { company_id, types: ['Trip', 'Fault', ...] } -> { ok, deleted: { Trip: 40, ... } }

// The same list companyCleanupPreview reports as history.
const HISTORY = ['Trip','Incident','Inspection','Broadcast','GroupMessage','Workplace','LostItemReport','Fault','DriverShift'];
const MAX_PER_TYPE = 20000;

export default async function(req: Request) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin' || user.disabled) return Response.json({ error: 'Admin required' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id;
    const types = Array.isArray(body.types) ? [...new Set(body.types)] : [];
    if (typeof companyId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) return Response.json({ error: 'company_id required' }, { status: 400 });
    if (!types.length || types.some((t) => !HISTORY.includes(t as string))) return Response.json({ error: 'Choose which kinds of history to delete' }, { status: 400 });
    const db = base44.asServiceRole.entities;
    // Only a company that is really gone.
    if (await db.Company.get(companyId).catch(() => null)) return Response.json({ error: 'That company still exists. Delete it first.' }, { status: 409 });
    const deleted: Record<string, number> = {};
    for (const type of types as string[]) {
      let n = 0;
      for (;;) {
        const rows = (await db[type].filter({ company_id: companyId }, 'id', 500)).filter((r: any) => r.company_id === companyId);
        if (!rows.length) break;
        for (const row of rows) { await db[type].delete(row.id); n++; }
        if (n >= MAX_PER_TYPE) break;
      }
      deleted[type] = n;
    }
    await db.AuditLog.create({
      action: 'delete', entity: 'Company', record_id: companyId, page: '/admin/companies',
      actor_email: user.email || '', actor_name: user.full_name || '', actor_role: user.role,
      summary: `Deleted history left by a removed company: ${Object.entries(deleted).map(([t, n]) => `${n} ${t}`).join(', ')}`,
    }).catch(() => {});
    return Response.json({ ok: true, deleted });
  } catch {
    return Response.json({ error: 'Not all of it could be deleted. Find the records again to see what is left.' }, { status: 500 });
  }
}
