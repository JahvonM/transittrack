import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { scopedEntities, withRateLimitRetry } from '@/lib/scopedEntities';
import { withAuditLog } from '@/lib/auditLog';
import { addBreadcrumb } from '@/lib/breadcrumbs';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});

// A failed server call is remembered for the next error report (Admin → App
// errors shows it in "what happened before"). Only the function name and the
// reply's status and message are kept, never what was sent.
const originalInvoke = base44.functions.invoke.bind(base44.functions);
base44.functions.invoke = async (name, ...rest) => {
  try {
    return await originalInvoke(name, ...rest);
  } catch (error) {
    const status = error?.status ?? error?.response?.status ?? "no connection";
    const said = error?.response?.data?.error || error?.data?.error || error?.message || "";
    if (name !== "reportClientError") addBreadcrumb("server", `${name} failed (${status})${said ? `: ${said}` : ""}`);
    throw error;
  }
};

// Record admin/staff edits in the AuditLog ("Change history" in Admin).
base44.entities = withAuditLog(scopedEntities(base44));

// Presentation context uses approved membership, never mutable profile company_id.
const originalAuth = base44.auth;
let profileRequest = null;
base44.auth = new Proxy(originalAuth, {
  get(target, method) {
    if (method === 'me') return () => {
      if (!profileRequest) {
        profileRequest = withRateLimitRetry(() => base44.functions.invoke('entityAccess', { entity: 'User', operation: 'get', id: 'me' }), { attempts: 3 })
          .then(response => response.data.result)
          .finally(() => { profileRequest = null; });
      }
      return profileRequest;
    };
    if (method === 'updateMe') return async data => {
      const profile = await base44.auth.me();
      return base44.entities.User.update(profile.id, data);
    };
    const value=target[method];
    return typeof value==='function' ? value.bind(target) : value;
  }
});