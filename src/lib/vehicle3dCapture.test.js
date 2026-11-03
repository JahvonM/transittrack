import { describe, expect, it } from "vitest";
import { MAX_3D_PHOTOS, validateScanModel, validateScanPhoto } from "./vehicle3dCapture";

describe("vehicle 3D capture validation", () => {
  it("allows valid photos below the photo limit", () => {
    expect(validateScanPhoto({ type: "image/jpeg", size: 1024 }, 25)).toBe(null);
  });
  it("rejects invalid photos, oversized files and exhausted sessions", () => {
    expect(validateScanPhoto({ type: "text/plain", size: 100 }, 0)).toMatch(/image/);
    expect(validateScanPhoto({ type: "image/jpeg", size: 0 }, 0)).toMatch(/Empty/);
    expect(validateScanPhoto({ type: "image/png", size: 21 * 1024 * 1024 }, 0)).toMatch(/20 MB/);
    expect(validateScanPhoto({ type: "image/jpeg", size: 400 }, MAX_3D_PHOTOS)).toMatch(/limit/);
  });
  it("accepts GLB models and rejects unsupported or oversized files", () => {
    expect(validateScanModel({ name: "Bus.GLB", size: 2048 })).toBe(null);
    expect(validateScanModel({ name: "model.gltf", size: 2048 })).toMatch(/GLB/);
    expect(validateScanModel({ name: "bus.glb", size: 160 * 1024 * 1024 })).toMatch(/150 MB/);
    expect(validateScanModel({ name: "bus.glb", size: 0 })).toMatch(/Empty/);
  });
});
