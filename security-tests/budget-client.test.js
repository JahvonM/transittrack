import {describe,it,expect} from 'vitest';
import {createDurableAttemptBudget} from '../base44/shared/durableAttemptBudget';
const id='12345678-1234-4234-8234-123456789abc';
const config={url:'https://example.supabase.co',serviceRoleKey:'backend-test-key-never-real'};
describe('durable attempt budget transport',()=>{
 it('classifies DNS failures without returning the raw exception',async()=>{
  const client=createDurableAttemptBudget({...config,fetchImpl:async()=>{throw Error('DNS resolve sb_secret_PRIVATE');}});
  let error;try{await client.reserve('scope',id,5,60000);}catch(e){error=e;}
  expect(error.networkKind).toBe('dns');expect(JSON.stringify(error)).not.toContain('PRIVATE');
 });
 it('rejects whitespace inside credentials before network access',()=>{
  expect(()=>createDurableAttemptBudget({...config,serviceRoleKey:'sb_secret_invalid key with whitespace'})).toThrow('Missing atomic store backend credential');
 });

 it('retains safe HTTP diagnostics and discards provider messages',async()=>{
  const client=createDurableAttemptBudget({...config,fetchImpl:async()=>Response.json({code:'PGRST202',message:'sb_secret_PRIVATE'},{status:404})});
  let error;try{await client.reserve('scope',id,5,60000);}catch(e){error=e;}
  expect(error).toMatchObject({reason:'http',httpStatus:404,providerCode:'PGRST202'});
  expect(error.message).toBe('Atomic budget unavailable');
  expect(JSON.stringify(error)).not.toContain('PRIVATE');
 });
 it('never reflects arbitrary provider codes',async()=>{
  const client=createDurableAttemptBudget({...config,fetchImpl:async()=>Response.json({code:'sb_secret_PRIVATE'},{status:401})});
  let error;try{await client.reserve('scope',id,5,60000);}catch(e){error=e;}
  expect(error.httpStatus).toBe(401);expect(error.providerCode).toBeUndefined();
 });

 for (const key of ['sb_secret_synthetic-never-real-key', 'eyJsynthetic-legacy-key-never-real']) it('uses correct authentication headers for '+(key.startsWith('sb_')?'secret keys':'legacy JWTs'),async()=>{
  let headers;
  const client=createDurableAttemptBudget({...config,serviceRoleKey:key,fetchImpl:async(_url,init)=>{headers=init.headers;return Response.json(true);}});
  await client.reserve('scope',id,5,60000);
  expect(headers.apikey).toBe(key);
  if(key.startsWith('sb_secret_')) expect(headers).not.toHaveProperty('Authorization');
  else expect(headers.Authorization).toBe('Bearer '+key);
 });
 it('hashes scope and keeps request ID stable for unknown-outcome retries',async()=>{const calls=[];const client=createDurableAttemptBudget({...config,fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json(true);}});await client.reserve('tenant:device:pin',id,5,60000);await client.reserve('tenant:device:pin',id,5,60000);const a=JSON.parse(calls[0].init.body);expect(a.p_scope_hash).toMatch(/^[a-f0-9]{64}$/);expect(a.p_request_id).toBe(id);expect(calls[1].init.body).toBe(calls[0].init.body);expect(calls[0].init.redirect).toBe('error');});
 it('accepts denial without converting it into a provider failure',async()=>{const client=createDurableAttemptBudget({...config,fetchImpl:async()=>Response.json(false)});expect(await client.reserve('scope',id,5,60000)).toBe(false);});
 for(const response of [()=>new Response('secret-provider-error',{status:500}),()=>Response.json({allowed:true}),()=>{throw Error('secret-key');}])it('fails closed and hides provider details',async()=>{const client=createDurableAttemptBudget({...config,fetchImpl:async()=>response()});await expect(client.reserve('scope',id,5,60000)).rejects.toThrow('Atomic budget unavailable');});
 it('rejects insecure origins and invalid budgets before network access',async()=>{expect(()=>createDurableAttemptBudget({...config,url:'http://example.supabase.co'})).toThrow();expect(()=>createDurableAttemptBudget({...config,url:'https://example.supabase.co.evil.test'})).toThrow();expect(()=>createDurableAttemptBudget({...config,url:'https://user:pass@example.supabase.co'})).toThrow();const client=createDurableAttemptBudget({...config,fetchImpl:()=>{throw Error('must not call');}});await expect(client.reserve('scope',id,0,60000)).rejects.toThrow('Invalid budget request');});
});
