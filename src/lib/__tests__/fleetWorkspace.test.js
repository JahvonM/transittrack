import { describe, it, expect } from "vitest";
import { busSummaries, cameraTablets, fleetAlerts, locationState } from "../fleetWorkspace";

const NOW = Date.UTC(2026, 10, 2, 12);
const ago = (min) => new Date(NOW - min * 60_000).toISOString();
const bus = (id, extra = {}) => ({ id, name: "Bus " + id, tracking_active: true, last_location_update: ago(0.5), ...extra });
const tablet = (id, vehicle_id, kiosk_type, extra = {}) => ({ id, vehicle_id, kiosk_type, label: id, paired: true, status: "active", last_seen: ago(1), helper_health: {}, ...extra });

describe("fleet workspace", () => {
  it("says live, last known or unavailable, never stale as live", () => {
    expect(locationState(bus("a"), NOW).state).toBe("live");
    expect(locationState(bus("a", { last_location_update: ago(30) }), NOW).state).toBe("last_known");
    expect(locationState(bus("a", { last_location_update: null }), NOW).state).toBe("unavailable");
  });
  it("counts on board only where a boarding tablet is reporting", () => {
    const checkIns = [
      { vehicle_id: "a", card_tag: "x", status: "boarded", boarded_at: ago(20) },
      { vehicle_id: "a", card_tag: "y", status: "boarded", boarded_at: ago(15) },
      { vehicle_id: "a", card_tag: "y", status: "off_board", boarded_at: ago(5) },
    ];
    const [a, b] = busSummaries({ vehicles: [bus("a"), bus("b")], kiosks: [tablet("k1", "a", "bus_boarding")], checkIns, now: NOW });
    expect(a.onBoard).toBe(1);
    expect(b).toMatchObject({ onBoard: null, onBoardWhy: "No boarding tablet" });
    const [stale] = busSummaries({ vehicles: [bus("a")], kiosks: [tablet("k1", "a", "bus_boarding", { last_seen: ago(60) })], checkIns, now: NOW });
    expect(stale).toMatchObject({ onBoard: null, onBoardWhy: "Boarding tablet not reporting" });
  });
  it("raises what needs acting on, most urgent first", () => {
    const s = busSummaries({
      vehicles: [bus("a", { status: "emergency" }), bus("b", { last_location_update: ago(40) })],
      kiosks: [tablet("d1", "b", "driver", { last_seen: ago(30), helper_health: { battery: 12, charging: false, management_available: true, management_owner: true, kiosk_enabled: true, kiosk_locked: false } })],
      shifts: [{ vehicle_id: "b", started_at: ago(90) }],
      now: NOW,
    });
    const alerts = fleetAlerts(s, { openRequests: 2, now: NOW });
    expect(alerts[0].text).toMatch(/Bus a: SOS/);
    expect(alerts.map((a) => a.key)).toEqual(expect.arrayContaining(["gps:b", "off:d1", "bat:d1", "lock:d1", "requests"]));
    expect(alerts.findIndex((a) => a.key === "requests")).toBeGreaterThan(alerts.findIndex((a) => a.key === "gps:b"));
  });
  it("offers only driver tablets with direct viewing as cameras, never a boarding tablet's QR camera", () => {
    const ok = { support_available: true, support_transport: "webrtc" };
    const list = cameraTablets([tablet("d1", "a", "driver", { helper_health: ok }), tablet("k1", "a", "bus_boarding", { helper_health: ok }), tablet("d2", "a", "driver", { helper_health: {} }), tablet("p1", "a", "driver", { personal: true, helper_health: ok })]);
    expect(list.map((k) => k.id)).toEqual(["d1"]);
  });
});
