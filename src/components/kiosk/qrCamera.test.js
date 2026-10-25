import { describe, it, expect, vi } from 'vitest';
import { startQrCamera } from './qrCamera';
import createGate from './qrScanGate';
describe('phone QR camera recovery',()=>{
 it('retries unsupported facing constraints',async()=>{const scanner={start:vi.fn().mockRejectedValueOnce({name:'OverconstrainedError'}).mockResolvedValueOnce()};await startQrCamera(scanner,'environment',false,{},()=>{},()=>{});expect(scanner.start).toHaveBeenCalledTimes(2);});
 it('does not retry denied permissions or bypass a required front camera',async()=>{for(const [error,exact] of [[{name:'NotAllowedError'},false],[{name:'NotFoundError'},true]]){const scanner={start:vi.fn().mockRejectedValue(error)};await expect(startQrCamera(scanner,'user',exact,{},()=>{},()=>{})).rejects.toBe(error);expect(scanner.start).toHaveBeenCalledTimes(1);}});
 it('allows a slow phone decoder while keeping a stable repeated read',()=>{const gate=createGate({stableMs:300,maxGapMs:1500});gate.start(0);expect(gate.read('qr',100)).toBe(false);expect(gate.read('qr',900)).toBe(true);expect(gate.read('qr',4000)).toBe(false);});
});
