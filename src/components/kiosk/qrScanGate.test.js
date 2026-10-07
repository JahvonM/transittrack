import { describe, expect, it } from "vitest";
import createQrScanGate from "@/components/kiosk/qrScanGate";

const CODE = "tt-code:123456";
const startGate = () => {
  const gate = createQrScanGate({ stableMs: 800, warmupMs: 1000 });
  gate.start(0);
  return gate;
};

describe("boarding camera read confirmation", () => {
  it("ignores detections before the camera has settled", () => {
    const gate = startGate();
    for (let t = 0; t < 1000; t += 100) expect(gate.read(CODE, t)).toBe(false);
    expect(gate.read(CODE, 1000)).toBe(false);
    expect(gate.read(CODE, 1100)).toBe(false);
  });
  it("requires the same code continuously for 800ms, not just two frames", () => {
    const gate = startGate();
    for (let t = 1000; t < 1800; t += 100) expect(gate.read(CODE, t)).toBe(false);
    expect(gate.read(CODE, 1800)).toBe(true);
  });
  it("does not combine reads separated by a lost or blurry view", () => {
    const gate = startGate();
    expect(gate.read(CODE, 1000)).toBe(false);
    gate.miss(1400);
    for (let t = 1800; t < 2600; t += 100) expect(gate.read(CODE, t)).toBe(false);
    expect(gate.read(CODE, 2600)).toBe(true);
  });
  it("resets when a different QR enters the view", () => {
    const gate = startGate();
    for (let t = 1000; t <= 1500; t += 100) expect(gate.read(CODE, t)).toBe(false);
    const other = "tt-code:654321";
    for (let t = 1600; t < 2400; t += 100) expect(gate.read(other, t)).toBe(false);
    expect(gate.read(other, 2400)).toBe(true);
  });
  it("suppresses repeated detections after a confirmed read", () => {
    const gate = startGate();
    for (let t = 1000; t < 1800; t += 100) gate.read(CODE, t);
    expect(gate.read(CODE, 1800)).toBe(true);
    for (let t = 1900; t <= 3000; t += 100) expect(gate.read(CODE, t)).toBe(false);
  });
  it("preserves the default two-read behavior outside the boarding kiosk", () => {
    const gate = createQrScanGate();
    gate.start(0);
    expect(gate.read(CODE, 100)).toBe(false);
    expect(gate.read(CODE, 200)).toBe(true);
  });
});