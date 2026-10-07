// The platform rejects bursts of backend calls with 429 ("Too many requests").
// Handlers that make several entity calls in a row used to fail the whole
// request on the first rejection, which the app then showed to people as a
// connection error. A 429 was never run, so waiting and asking again is safe.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retry429<T>(fn: () => Promise<T>): Promise<T> {
 for (let attempt = 0; ; attempt++) {
  try { return await fn(); }
  catch (error: any) {
   const status = error?.status ?? error?.response?.status;
   if (status !== 429 || attempt >= 3) throw error;
   await sleep(600 * 2 ** attempt + Math.random() * 300);
  }
 }
}