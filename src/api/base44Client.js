import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { scopedEntities } from '@/lib/scopedEntities';
import { withAuditLog } from '@/lib/auditLog';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});

// Record admin/staff edits in the AuditLog ("Change history" in Admin).
base44.entities = withAuditLog(scopedEntities(base44));

// Presentation context uses approved membership, never mutable profile company_id.
const originalAuth = base44.auth;
base44.auth = new Proxy(originalAuth, {
  get(target, method) {
    if (method === 'me') return async () => {
      const response = await base44.functions.invoke('entityAccess', { entity: 'User', operation: 'get', id: 'me' });
      return response.data.result;
    };
    if (method === 'updateMe') return async data => {
      const profile = await base44.auth.me();
      return base44.entities.User.update(profile.id, data);
    };
    const value=target[method];
    return typeof value==='function' ? value.bind(target) : value;
  }
});
