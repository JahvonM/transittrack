import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
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
base44.entities = withAuditLog(base44.entities);
