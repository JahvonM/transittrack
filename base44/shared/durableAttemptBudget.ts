// S06 foundation: explicit backend-only client. Not activated by atomicOps yet.
// Never import this module into a browser component.
export function createDurableAttemptBudget(config: {
 url: string; serviceRoleKey: string; fetchImpl?: typeof fetch; timeoutMs?: number;
}) {
 const url = new URL(config.url);
 if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  || url.port || url.username || url.password || url.search || url.hash
  || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Invalid atomic store URL');
 if (!config.serviceRoleKey || config.serviceRoleKey.length < 20 || /\s/.test(config.serviceRoleKey)) throw new Error('Missing atomic store backend credential');
 const timeoutMs = config.timeoutMs ?? 5000;
 if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('Invalid atomic store timeout');
 const fetchImpl = config.fetchImpl ?? fetch;
 return {
  async reserve(scope: string, requestId: string, limit: number, windowMs: number): Promise<boolean> {
   if (typeof scope !== 'string' || scope.length < 1 || scope.length > 1000
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
    || !Number.isInteger(limit) || limit < 1 || limit > 10000
    || !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 86400000) throw new Error('Invalid budget request');
   const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
   const scopeHash = [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   let reason = 'network';
   let httpStatus: number | undefined;
   let providerCode: string | undefined;
   let networkKind: string | undefined;
   try {
    const response = await fetchImpl(url.origin+'/rest/v1/rpc/tt_reserve_attempt', {
     method:'POST', redirect:'error', signal:AbortSignal.timeout(timeoutMs),
     // New Supabase secret keys are not JWTs: use apikey only.
     // Preserve Bearer authentication for legacy service_role JWTs.
     headers:{'Content-Type':'application/json',apikey:config.serviceRoleKey,
      ...(config.serviceRoleKey.startsWith('sb_secret_') ? {} : {Authorization:'Bearer '+config.serviceRoleKey})},
     body:JSON.stringify({p_scope_hash:scopeHash,p_request_id:requestId,p_limit:limit,p_window_ms:windowMs}),
    });
    httpStatus = response.status;
    if (!response.ok) {
     reason = 'http';
     // Return only known error codes, never provider messages/details.
     const body = await response.json().catch(()=>null);
     const codes = ['PGRST202','PGRST301','PGRST302','42501','22023','23505','42P01','42883'];
     if (codes.includes(body?.code)) providerCode = body.code;
     throw new Error('Unsuccessful budget response');
    }
    reason = 'response';
    const value = await response.json();
    if (typeof value !== 'boolean') throw new Error('Invalid budget response');
    return value;
   } catch (error) {
    // Sanitized metadata only; never include the provider message/body/key.
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') reason = 'timeout';
    if (reason === 'network') {
     // Classify locally, but never disclose raw exception strings.
     const text = String(error?.message || '')+' '+String(error?.cause?.code || '');
     if (/dns|resolve|ENOTFOUND|EAI_AGAIN/i.test(text)) networkKind = 'dns';
     else if (/certificate|tls|ssl/i.test(text)) networkKind = 'tls';
     else if (/permission|notcapable|net access|network access.*denied/i.test(text)) networkKind = 'permission';
     else if (/header|invalid character|ByteString/i.test(text)) networkKind = 'request-header';
     else if (/redirect/i.test(text)) networkKind = 'redirect';
     else if (/ECONNREFUSED|connection refused/i.test(text)) networkKind = 'connection-refused';
     else networkKind = 'unclassified';
    }
    throw Object.assign(new Error('Atomic budget unavailable'), {reason,httpStatus,providerCode,networkKind});
   }
  },
 };
}
