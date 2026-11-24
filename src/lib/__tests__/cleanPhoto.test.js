import { describe, it, expect, afterEach, vi } from "vitest";
import { HEIC_PROBLEM, isHeic, photoForUpload } from "@/lib/cleanPhoto";

// HEIC photos are redrawn as JPEG before uploading (the server strips GPS
// from JPEG, PNG and WebP, not HEIC); anything else uploads as it is.

const file = (name, type) => Object.assign(new Blob(["x"], { type }), { name });

function fakeCanvas({ blob = new Blob(["jpeg"], { type: "image/jpeg" }) } = {}) {
  const drawn = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...a) => drawn.push(a) }), toBlob: (cb, type, q) => cb(blob && Object.assign(blob, { asked: [type, q] })) };
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, drawn };
}

afterEach(() => vi.unstubAllGlobals());

describe("photoForUpload", () => {
  it("leaves JPEG, PNG and other files alone", async () => {
    for (const f of [file("a.jpg", "image/jpeg"), file("b.png", "image/png"), file("c.pdf", "application/pdf")]) {
      expect(isHeic(f)).toBe(false);
      expect(await photoForUpload(f)).toBe(f);
    }
  });

  it("knows HEIC by its type or its name", () => {
    expect(isHeic(file("IMG_1.HEIC", ""))).toBe(true);
    expect(isHeic(file("photo", "image/heif"))).toBe(true);
    expect(isHeic(file("photo", "image/heic-sequence"))).toBe(true);
  });

  it("redraws HEIC as a JPEG the right way up", async () => {
    const opts = [];
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", async (_f, o) => { opts.push(o); return { width: 4032, height: 3024, close }; });
    const { canvas, drawn } = fakeCanvas();
    const out = await photoForUpload(file("IMG_0042.HEIC", "image/heic"));
    expect(opts).toEqual([{ imageOrientation: "from-image" }]);
    expect(out.name).toBe("IMG_0042.jpg");
    expect(out.type).toBe("image/jpeg");
    expect([canvas.width, canvas.height]).toEqual([4032, 3024]);
    expect(drawn).toHaveLength(1);
    expect(close).toHaveBeenCalled();
  });

  it("shrinks a huge photo to a size phones can draw", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 8064, height: 6048 }));
    const { canvas } = fakeCanvas();
    await photoForUpload(file("big.heic", "image/heic"));
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_000_000);
    expect(canvas.width / canvas.height).toBeCloseTo(8064 / 6048, 2);
  });

  it("says so, and uploads nothing, when the phone can't read it", async () => {
    vi.stubGlobal("createImageBitmap", async () => { throw new Error("unsupported"); });
    await expect(photoForUpload(file("x.heic", "image/heic"))).rejects.toThrow(HEIC_PROBLEM);
    vi.stubGlobal("createImageBitmap", async () => ({ width: 10, height: 10 }));
    fakeCanvas({ blob: null });
    await expect(photoForUpload(file("x.heic", "image/heic"))).rejects.toThrow(HEIC_PROBLEM);
  });
});
