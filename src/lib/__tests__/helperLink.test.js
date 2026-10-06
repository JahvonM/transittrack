import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(() => { installMemoryStorage(); vi.stubGlobal("window", {}); });
afterEach(() => vi.unstubAllGlobals());

describe("reader helper link", () => {
  it("is lost when a tablet that had a helper stops hearing from it", async () => {
    const { helperLink } = await import("@/lib/helperHealth");
    const later = Date.now() + 4 * 60 * 1000;
    expect(helperLink(later)).toBe("none");
    localStorage.setItem("tt_badge_reader", "1");
    expect(helperLink(Date.now())).toBe("ok"); // just opened: give it time
    expect(helperLink(later)).toBe("lost");
    window.__ttHelperHealth = { at: later - 30_000 };
    expect(helperLink(later)).toBe("ok");
  });
  it("tells admin when the app checks in but the helper's reports stopped", async () => {
    const { helperLinkLost } = await import("@/lib/helperHealth");
    const now = Date.parse("2026-10-06T22:00:00Z");
    const ago = (m) => new Date(now - m * 60_000).toISOString();
    expect(helperLinkLost({ app_health: { reader: "usb_reader", reported_at: ago(1) }, helper_health: { reported_at: ago(2500) } }, now)).toBe(true);
    expect(helperLinkLost({ app_health: { reader: "usb_reader", reported_at: ago(1) }, helper_health: { reported_at: ago(1) } }, now)).toBe(false);
    expect(helperLinkLost({ app_health: { reader: "usb_reader", reported_at: ago(60) }, helper_health: { reported_at: ago(2500) } }, now)).toBe(false); // whole tablet offline
    expect(helperLinkLost({ app_health: { reader: "", reported_at: ago(1) } }, now)).toBe(false); // no helper
  });
});
