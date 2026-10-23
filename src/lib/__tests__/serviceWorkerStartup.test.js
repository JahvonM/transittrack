import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../../public/sw.js',import.meta.url),'utf8');
const html=()=>new Response('<html>Driver app</html>',{headers:{'Content-Type':'text/html'}});
function fixture(cached=null){
 const fetch=vi.fn();const match=vi.fn(async()=>cached);
 const context=vm.createContext({Response,URL,Set,Date,setTimeout,clearTimeout,fetch,caches:{match},importScripts(){},self:{addEventListener(){},location:{origin:'https://app.example'},skipWaiting(){}}});
 vm.runInContext(source,context);context.update=vi.fn(async()=>true);
 const waits=[];const event={request:{url:'https://app.example/driver',mode:'navigate'},waitUntil:p=>waits.push(p)};
 return {context,fetch,match,event,waits};
}
afterEach(()=>vi.useRealTimers());
describe('driver app first startup',()=>{
 it('waits past four seconds without claiming a slow first-time device is offline',async()=>{
  vi.useFakeTimers();const f=fixture();let finish;f.fetch.mockReturnValue(new Promise(r=>finish=r));let settled=false;
  const pending=f.context.page(f.event).then(r=>{settled=true;return r;});
  await vi.advanceTimersByTimeAsync(5000);expect(settled).toBe(false);
  finish(html());const response=await pending;expect(response.status).toBe(200);expect(await response.text()).toContain('Driver app');
  await Promise.all(f.waits);expect(f.context.update).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('still opens an existing offline copy after four seconds and stages a late network response',async()=>{
  vi.useFakeTimers();const cached=html(),f=fixture(cached);let finish;f.fetch.mockReturnValue(new Promise(r=>finish=r));
  const pending=f.context.page(f.event);await vi.advanceTimersByTimeAsync(4001);expect(await pending).toBe(cached);
  finish(html());await Promise.all(f.waits);expect(f.context.update).toHaveBeenCalled();
 });
 it('offers retry after a bounded first load, preserving the network request for background staging',async()=>{
  vi.useFakeTimers();const f=fixture();let finish;f.fetch.mockReturnValue(new Promise(r=>finish=r));const pending=f.context.page(f.event);
  await vi.advanceTimersByTimeAsync(30001);const response=await pending;expect(response.status).toBe(503);const body=await response.text();expect(body).toContain('Try again');expect(body).toContain("addEventListener('online'");expect(body).not.toContain('needs a connection the first time');
  finish(html());await Promise.all(f.waits);expect(f.context.update).toHaveBeenCalled();
 });
 it('uses the saved app when the server returns an error',async()=>{const cached=html(),f=fixture(cached);f.fetch.mockResolvedValue(new Response('Unavailable',{status:503}));expect(await f.context.page(f.event)).toBe(cached);await Promise.all(f.waits);});
 it('returns recovery controls for an actual disconnected first start',async()=>{const f=fixture();f.fetch.mockRejectedValue(new Error('offline'));const response=await f.context.page(f.event);expect(response.status).toBe(503);expect(await response.text()).toContain('Saved records and tablet pairing have not been cleared');await Promise.all(f.waits);});
});
