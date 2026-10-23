import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const PAGE_SIZE = 100;
async function all(db: any, type: string, company_id: string) {
  const result: any[] = [];
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const rows = await db[type].filter({company_id}, '-created_date', PAGE_SIZE, offset);
    result.push(...rows);
    if (rows.length < PAGE_SIZE) return result;
  }
  throw new Error('Too many records; manual cleanup required');
}
export default async function(req: Request) {
  try {
    const api = createClientFromRequest(req);
    const actor = await api.auth.me();
    if (!actor || actor.role !== 'admin') return Response.json({error:'Admin required'}, {status:403});
    const {company_id} = await req.json();
    if (typeof company_id !== 'string' || !company_id.trim()) return Response.json({error:'company_id required'}, {status:400});
    const db = api.asServiceRole.entities;
    const company = await db.Company.get(company_id).catch(()=>null);
    if (!company) return Response.json({error:'Company already removed. Use orphan recovery for remaining records.'},{status:409});
    // Inventory every dependency before the first write. Fail closed if any query fails.
    const types = ['Vehicle','Route','Driver','CompanyMembership','CompanyAccessGrant','Contact','KioskDevice','DriverSession'];
    const inventory: Record<string,any[]> = {};
    for (const type of types) inventory[type] = await all(db,type,company_id);
    // Revoke company access first. Keep membership history, but disable active grants.
    for (const row of inventory.CompanyMembership) if (row.active) await db.CompanyMembership.update(row.id,{active:false});
    // Preserve users and all operational history; detach the company-owned assignments.
    for (const row of inventory.Driver) await db.Driver.update(row.id,{company_id:null,company_name:''});
    for (const row of inventory.Vehicle) await db.Vehicle.update(row.id,{company_id:null,company_name:'',tracking_active:false,status:'offline'});
    for (const row of inventory.Route) await db.Route.update(row.id,{company_id:null,company_name:'',active:false});
    // Devices, contacts, grants and sessions may still carry company permissions.
    // Never delete company until every dependency has a reviewed revocation strategy.
    if (inventory.CompanyAccessGrant.length || inventory.Contact.length || inventory.KioskDevice.length || inventory.DriverSession.length) {
      return Response.json({error:'Company records detached, but additional access-linked records require cleanup before final deletion',remaining:Object.fromEntries(['CompanyAccessGrant','Contact','KioskDevice','DriverSession'].map(t=>[t,inventory[t].length]))},{status:409});
    }
    // Verify no active operational assignments remain before removing the company.
    for (const type of ['Vehicle','Route','Driver']) if ((await all(db,type,company_id)).length) throw new Error('Detach verification failed: '+type);
    await db.Company.delete(company_id);
    return Response.json({ok:true,company_id,detached:Object.fromEntries(['Vehicle','Route','Driver'].map(t=>[t,inventory[t].length]))});
  } catch (e) {return Response.json({error:'Company deletion stopped: '+String((e as Error).message||e)},{status:500});}
}
