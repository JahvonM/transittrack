import {describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {createRecordingReceiver,MAX_RECORDING_BYTES,clipName,recordingDateRange} from '../recordingTransfer';
const name='1792195200000-1234567890abcdef.mp4';
function harness(extra={}){const sent=[];const r=createRecordingReceiver({send:text=>sent.push(JSON.parse(text)),digest:bytes=>webcrypto.subtle.digest('SHA-256',bytes),...extra});return {r,sent};}
const text=m=>JSON.stringify(m);
const hash=async b=>Buffer.from(await webcrypto.subtle.digest('SHA-256',b)).toString('hex');
describe('recording receiver completeness and bounds',()=>{
 it('accepts a paginated local clip list',async()=>{
  const {r,sent}=harness();const result=r.list({offset:0});const id=sent[0].id;
  await r.receive(text({type:'list',id,clips:[{name,at:1792195200000,bytes:20,protected:false,incomplete:false}],next:-1}));
  expect((await result).clips).toHaveLength(1);r.close();
 });
 it('offers video only after exact size and SHA256 verification',async()=>{
  const {r,sent}=harness();const result=r.get(name),id=sent[0].id;
  const data=new Uint8Array([1,2,3,4]).buffer;
  await r.receive(text({type:'start',id,name,bytes:4}));await r.receive(data);
  await r.receive(text({type:'end',id,bytes:4,sha256:await hash(data)}));
  const done=await result;expect(done.blob.size).toBe(4);expect(done.blob.type).toBe('video/mp4');r.close();
 });
 it('discards partial downloads on disconnect',async()=>{
  const {r,sent}=harness();const result=r.get(name);const rejected=expect(result).rejects.toThrow('Incomplete');
  await r.receive(text({type:'start',id:sent[0].id,name,bytes:4}));await r.receive(new Uint8Array([1,2]).buffer);r.close();await rejected;
 });
 it.each([0,-1,MAX_RECORDING_BYTES+1,1.5])('rejects invalid announced length %s',async bytes=>{
  const {r,sent}=harness();const result=r.get(name);const rejected=expect(result).rejects.toThrow();
  await expect(r.receive(text({type:'start',id:sent[0].id,name,bytes}))).rejects.toThrow();r.close();await rejected;
 });
 it('rejects overflow and unannounced chunks',async()=>{
  const {r,sent}=harness();const result=r.get(name);const rejected=expect(result).rejects.toThrow();
  await expect(r.receive(new Uint8Array([1]).buffer)).rejects.toThrow();
  await r.receive(text({type:'start',id:sent[0].id,name,bytes:1}));await expect(r.receive(new Uint8Array([1,2]).buffer)).rejects.toThrow();r.close();await rejected;
 });
 it('rejects a premature end and wrong digest',async()=>{
  const {r,sent}=harness();const result=r.get(name);const rejected=expect(result).rejects.toThrow();const id=sent[0].id;
  await r.receive(text({type:'start',id,name,bytes:2}));await r.receive(new Uint8Array([1]).buffer);
  await expect(r.receive(text({type:'end',id,bytes:2,sha256:'0'.repeat(64)}))).rejects.toThrow('Incomplete');
  await r.receive(new Uint8Array([2]).buffer);await expect(r.receive(text({type:'end',id,bytes:2,sha256:'0'.repeat(64)}))).rejects.toThrow('integrity');r.close();await rejected;
 });
 it('rejects wrong request IDs, duplicate starts and oversized metadata',async()=>{
  const {r,sent}=harness();const result=r.get(name);const rejected=expect(result).rejects.toThrow();const id=sent[0].id;
  await expect(r.receive(text({type:'start',id:'other',name,bytes:2}))).rejects.toThrow('match');
  await r.receive(text({type:'start',id,name,bytes:2}));await expect(r.receive(text({type:'start',id,name,bytes:2}))).rejects.toThrow();
  await expect(r.receive('x'.repeat(24001))).rejects.toThrow();r.close();await rejected;
 });
 it('refuses traversal and overlapping requests',async()=>{
  const {r}=harness();await expect(r.get('../secret')).rejects.toThrow();const result=r.get(name);const rejected=expect(result).rejects.toThrow();
  await expect(r.list({})).rejects.toThrow('progress');r.close();await rejected;
 });
 it('rejects missing acknowledgements after the transfer deadline',async()=>{
  vi.useFakeTimers();const {r}=harness({timeout:1000});const result=r.get(name);const rejected=expect(result).rejects.toThrow('did not finish');await vi.advanceTimersByTimeAsync(1001);await rejected;r.close();vi.useRealTimers();
 });
 it('does not complete after close while hashing',async()=>{
  let release;const {r,sent}=harness({digest:()=>new Promise(resolve=>{release=resolve;})});const result=r.get(name);const rejected=expect(result).rejects.toThrow();const id=sent[0].id;
  await r.receive(text({type:'start',id,name,bytes:1}));await r.receive(new Uint8Array([1]).buffer);
  const done=r.receive(text({type:'end',id,bytes:1,sha256:'0'.repeat(64)}));await Promise.resolve();await Promise.resolve();r.close();await rejected;
  // Blob.arrayBuffer may take another event-loop turn before digest is invoked.
  while(!release)await new Promise(resolve=>setImmediate(resolve));release(new Uint8Array(32).buffer);await done;
 });
 it('uses calendar boundaries and excludes partial or arbitrary names',()=>{
  const range=recordingDateRange('2026-10-17');expect(range.until-range.from).toBe(86400000);
  expect(clipName(name)).toBe(true);expect(clipName(name.replace('.mp4','-partial.mp4'))).toBe(false);expect(clipName('../'+name)).toBe(false);
 });
});
