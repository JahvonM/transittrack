import { describe, it, expect } from "vitest";
import { boardingLayout, isValidatorModel, nfcHint, rememberKioskLayout, KIOSK_LAYOUT_KEY } from "@/lib/kioskLayout";

describe("validator layout", () => {
  it("is picked automatically for a T10, and only when nothing else was chosen", () => {
    expect(isValidatorModel("QUALCOMM T10")).toBe(true);
    expect(isValidatorModel("T30Pro")).toBe(false);
    expect(isValidatorModel("Coolpad K18")).toBe(false);
    expect(boardingLayout("auto", "auto", 720, "QUALCOMM T10")).toBe("validator");
    expect(boardingLayout("auto", null, 390, "QUALCOMM T10")).toBe("validator");
    // Admin's choice, or the one made on the device, wins over the model.
    expect(boardingLayout("phone", "auto", 720, "QUALCOMM T10")).toBe("phone");
    expect(boardingLayout("auto", "tablet", 720, "QUALCOMM T10")).toBe("tablet");
    expect(boardingLayout("validator", "auto", 1280, "")).toBe("validator");
    // Other devices behave as before.
    expect(boardingLayout("auto", "auto", 390, "Coolpad K18")).toBe("phone");
    expect(boardingLayout("auto", "auto", 1280, "T30Pro")).toBe("tablet");
  });

  it("can be remembered on the device", () => {
    const store = new Map();
    const storage = { setItem: (k, v) => store.set(k, v) };
    rememberKioskLayout("validator", storage);
    expect(store.get(KIOSK_LAYOUT_KEY)).toBe("validator");
    rememberKioskLayout("nonsense", storage);
    expect(store.get(KIOSK_LAYOUT_KEY)).toBe("validator");
  });
});

describe("where to tap the card", () => {
  it("follows the layout unless a position is set", () => {
    expect(nfcHint("validator").title).toBe("Tap your card above the screen");
    expect(nfcHint("phone").title).toBe("Hold your card to the back of the phone");
    expect(nfcHint("tablet").title).toBe("Tap your card on the reader");
    expect(nfcHint("phone", "back_top").title).toMatch(/near the top/);
    expect(nfcHint("tablet", "above_screen").where).toBe("above_screen");
    expect(nfcHint("phone", "made-up").where).toBe("back_middle");
  });
});

import { nearestStopOf, positionState, orderedStops } from "@/lib/busInfo";

describe("in-bus information screen", () => {
  it("is only chosen in Admin, never automatically", () => {
    expect(boardingLayout("info", "auto", 1280, "")).toBe("info");
    expect(boardingLayout("auto", "auto", 1280, "QUALCOMM T10")).toBe("validator");
  });
  it("says a position is live only when it's fresh, and names the nearest stop", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    const bus = { current_lat: 12.05, current_lng: -61.75, last_location_update: "2026-11-02T11:59:30Z" };
    const route = { stops: [{ name: "Grand Anse", lat: 12.0, lng: -61.78, order: 1 }, { name: "Town", lat: 12.049, lng: -61.751, order: 0 }] };
    expect(positionState(bus, now)).toBe("live");
    expect(positionState({ ...bus, last_location_update: "2026-11-02T11:50:00Z" }, now)).toBe("last_known");
    expect(positionState({}, now)).toBe("none");
    expect(nearestStopOf(bus, route).name).toBe("Town");
    expect(orderedStops(route).map((s) => s.name)).toEqual(["Town", "Grand Anse"]);
  });
});
