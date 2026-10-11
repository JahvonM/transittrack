import { httpStatus } from "./requestError";

// Every backend function shares this transport, including tablet calls.
// Never replay a mutation or a PIN/code verification automatically.
export function createFunctionTransport(invoke, { maxInFlight = 2, spacingMs = 250, cooldownMs = 15000 } = {}) {
 let running = 0, nextStart = 0, blockedUntil = 0, timer = null;
 const queue = [];
 const pauseError = () => {
  const seconds = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
  return Object.assign(new Error(`Server is busy. Try again in ${seconds} seconds.`), {
   status: 429, data: { error: `Server is busy. Try again in ${seconds} seconds.`, code: "CLIENT_RATE_COOLDOWN" },
   response: { status: 429, headers: { "retry-after": String(seconds) } },
  });
 };
 const delayOf = error => {
  const headers = error?.originalError?.response?.headers ?? error?.response?.headers ?? error?.headers;
  const value = headers?.get?.("retry-after") ?? headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (value == null || String(value).trim() === "") return cooldownMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(cooldownMs, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(cooldownMs, date - Date.now()) : cooldownMs;
 };
 const pump = () => {
  clearTimeout(timer); timer = null;
  if (Date.now() < blockedUntil) {
   // Do not accumulate delayed boarding/PIN requests during a cooldown.
   while (queue.length) queue.shift().reject(pauseError());
   return;
  }
  if (!queue.length || running >= maxInFlight) return;
  const wait = nextStart - Date.now();
  if (wait > 0) { timer = setTimeout(pump, wait); return; }
  const job = queue.shift();
  running++; nextStart = Date.now() + spacingMs;
  Promise.resolve().then(() => invoke(...job.args)).then(job.resolve, error => {
   if (httpStatus(error) === 429) blockedUntil = Math.max(blockedUntil, Date.now() + delayOf(error));
   job.reject(error);
  }).finally(() => { running--; pump(); });
  pump();
 };
 return (...args) => new Promise((resolve, reject) => {
  queue.push({ args, resolve, reject }); pump();
 });
}
