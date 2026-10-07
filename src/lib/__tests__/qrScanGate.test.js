import { describe, it, expect } from 'vitest';
import { qrScanGate } from '../qrScanGate';
describe('camera QR request gate', () => {
 it('requires uninterrupted stable reads, then submits once per session', () => {
  let t=0;const gate=qrScanGate({now:()=>t});
  expect(gate.read('qr')).toBe(false);t=200;expect(gate.read('qr')).toBe(false);
  gate.miss();t=800;expect(gate.read('qr')).toBe(false);
  t=1100;expect(gate.read('qr')).toBe(false);t=1400;expect(gate.read('qr')).toBe(true);
  gate.done();t=5000;for(let i=0;i<100;i++)expect(gate.read('qr')).toBe(false);
 });
 it('blocks other codes during lookup and requires them to settle afterwards',()=>{
  let t=0;const gate=qrScanGate({now:()=>t});
  gate.read('a');t=300;gate.read('a');t=600;expect(gate.read('a')).toBe(true);
  t=1000;expect(gate.read('b')).toBe(false);t=1600;expect(gate.read('b')).toBe(false);
  gate.done();expect(gate.read('b')).toBe(false);t=1900;expect(gate.read('b')).toBe(false);t=2200;expect(gate.read('b')).toBe(true);
 });
 it('resets stability when the payload changes',()=>{
  let t=0;const gate=qrScanGate({now:()=>t});gate.read('a');
  t=600;expect(gate.read('b')).toBe(false);t=900;expect(gate.read('a')).toBe(false);
 });
});
