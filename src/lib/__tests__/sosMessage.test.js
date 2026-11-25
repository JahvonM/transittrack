import { describe, it, expect } from "vitest";
import { sosMessage, waLink } from "@/lib/mapbox";

// The WhatsApp text a driver sends management after pressing SOS.
describe("SOS message", () => {
  it("says who, which bus and where the bus last reported, and asks for a call", () => {
    expect(sosMessage({ driver: "Kevin Thomas", bus: "Bus 1", lat: 12.052612, lng: -61.751634 }))
      .toBe("SOS from Kevin Thomas on Bus 1: I need help now. Please call me. Last known location: https://maps.google.com/?q=12.05261,-61.75163");
  });
  it("still makes sense with only some of it known", () => {
    expect(sosMessage({ bus: "Bus 1" })).toBe("SOS from Bus 1: I need help now. Please call me.");
    expect(sosMessage({ driver: "Kevin Thomas" })).toBe("SOS from Kevin Thomas: I need help now. Please call me.");
    expect(sosMessage()).toBe("SOS: I need help now. Please call me.");
    expect(sosMessage({ driver: "Kevin", lat: null, lng: -61.7 })).toBe("SOS from Kevin: I need help now. Please call me.");
  });
  it("never guesses the cause or promises a backup bus", () => {
    const text = sosMessage({ driver: "Kevin", bus: "Bus 1", lat: 12, lng: -61 });
    expect(text).not.toMatch(/mechanical|delay|backup|dispatched/i);
  });
  it("goes into the WhatsApp link intact", () => {
    const link = waLink("+1 473 555 0100", sosMessage({ driver: "Kevin", bus: "Bus 1" }));
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("SOS from Kevin on Bus 1: I need help now. Please call me.");
  });
});
