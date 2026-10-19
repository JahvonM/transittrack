import { createDurableAttemptBudget } from './durableAttemptBudget.ts';

// Backend request-budget factory. No local/entity fallback, no client scope input.
// UUID is fresh per backend request; unknown outcomes stop before downstream work.
export function createConfiguredAttemptReservation(readSecret: (name:string)=>string|null|undefined, fetchImpl?:typeof fetch) {
 return async (key:string,limit:number,windowMs:number):Promise<boolean> => {
  try {
   const url=readSecret('TT_ATOMIC_STORE_URL')?.trim();
   const serviceRoleKey=readSecret('TT_ATOMIC_SERVICE_ROLE_KEY')?.trim();
   if (!url || !serviceRoleKey || serviceRoleKey.startsWith('sb_publishable_')) throw new Error('Missing backend configuration');
   const budget=createDurableAttemptBudget({url,serviceRoleKey,fetchImpl,timeoutMs:10000});
   return await budget.reserve('request-budget:v1:'+key,crypto.randomUUID(),limit,windowMs);
  } catch {
   // No provider metadata, URLs or credentials reach ordinary app users.
   throw Object.assign(new Error('Verification service temporarily unavailable. Please try again.'),{status:503});
  }
 };
}
