import { describe, it, expect } from "vitest";
import { isOtherSite, DRIVER_ALLOWED } from "../kioskLinkLock";

const BASE = "https://eager-transit-track-go.base44.app/kiosk";

describe("kiosk link lock", () => {
  it("only lets pages on this site open", () => {
    expect(isOtherSite("/staff", BASE)).toBe(false);
    expect(isOtherSite("https://eager-transit-track-go.base44.app/driver", BASE)).toBe(false);
    expect(isOtherSite("#top", BASE)).toBe(false);
    expect(isOtherSite("https://www.mapbox.com/about/maps/", BASE)).toBe(true);
    expect(isOtherSite("http://eager-transit-track-go.base44.app/", BASE)).toBe(true);
    expect(isOtherSite("tel:+18765550100", BASE)).toBe(true);
    expect(isOtherSite("javascript:alert(1)", BASE)).toBe(true);
  });

  it("driver tablets keep WhatsApp and Google Maps hand-offs only", () => {
    expect(isOtherSite("https://wa.me/18765550100?text=SOS", BASE, DRIVER_ALLOWED)).toBe(false);
    expect(isOtherSite("https://www.google.com/maps/dir/?api=1&destination=1,2", BASE, DRIVER_ALLOWED)).toBe(false);
    expect(isOtherSite("https://www.google.com/search?q=x", BASE, DRIVER_ALLOWED)).toBe(true);
    expect(isOtherSite("https://wa.me.example.com/", BASE, DRIVER_ALLOWED)).toBe(true);
  });

});
