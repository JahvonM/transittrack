import { describe, it, expect } from "vitest";
import { setCooperativeGestures } from "../../components/map3d/cooperativeGestures.js";

// A stand-in for mapbox-gl 3's touch-pan and scroll-zoom handlers, with the
// same rule: the "use two fingers" notice is only made when a handler is
// switched on while the setting is already on.
function fakeMap(initial) {
  const map = { _cooperativeGestures: initial };
  const handler = () => ({
    _enabled: false,
    _alertContainer: undefined,
    isEnabled() { return this._enabled; },
    enable() { this._enabled = true; if (map._cooperativeGestures && !this._alertContainer) this._alertContainer = { style: {}, removed: false, remove() { this.removed = true; } }; },
    disable() { this._enabled = false; if (map._cooperativeGestures) this._alertContainer.remove(); },
    // A one-finger drag while the setting is on shows the notice.
    touch() { if (map._cooperativeGestures) this._alertContainer.style.visibility = "visible"; },
  });
  map.dragPan = handler();
  map.scrollZoom = handler();
  map.getCooperativeGestures = () => map._cooperativeGestures;
  map.setCooperativeGestures = (on) => { map._cooperativeGestures = on; return map; };
  map.dragPan.enable();
  map.scrollZoom.enable();
  return map;
}

describe("two-finger map preview", () => {
  it("turning it on after the map is made no longer crashes a one-finger drag", () => {
    // The old way: the setting alone, then a drag.
    const before = fakeMap(false);
    before.setCooperativeGestures(true);
    expect(() => before.dragPan.touch()).toThrow();

    const map = fakeMap(false);
    setCooperativeGestures(map, true);
    expect(() => map.dragPan.touch()).not.toThrow();
    expect(() => map.scrollZoom.touch()).not.toThrow();
    expect(map.dragPan.isEnabled()).toBe(true);
  });

  it("switches back for full screen, and does nothing when there's no change", () => {
    const map = fakeMap(false);
    setCooperativeGestures(map, true);
    setCooperativeGestures(map, false);
    expect(map.getCooperativeGestures()).toBe(false);
    expect(() => map.dragPan.touch()).not.toThrow();
    setCooperativeGestures(map, true);
    expect(() => map.dragPan.touch()).not.toThrow();
    const calls = [];
    const same = fakeMap(true);
    same.dragPan.disable = () => calls.push("disable");
    setCooperativeGestures(same, true);
    expect(calls).toEqual([]);
    expect(() => setCooperativeGestures(null, true)).not.toThrow();
  });
});
