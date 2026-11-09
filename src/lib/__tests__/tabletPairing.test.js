import { describe, it, expect, vi } from "vitest";
vi.mock("npm:@base44/sdk@0.8.44", () => ({ createClientFromRequest: vi.fn() }));
vi.mock("../../../base44/shared/forwardToSupabase.ts", () => ({ forwardToSupabase: vi.fn(async () => null) }));
vi.mock("../../../base44/shared/durableOperation.ts", () => ({ durableWritesEnabled: () => false, acquireOperation: vi.fn(), operationHash: vi.fn() }));
import handler from "../../../base44/functions/pairKioskDevice/entry.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { CHOOSE_SCREEN_PATH, pairingPath, screenForCode } from "@/lib/tabletPairing";

// A tablet set up as a kiosk that is now a driver tablet (or the other way
// round): the code from Admin, typed on the screen it was set up for, opens
// the right screen instead of being refused.

const rejected = (data) => Object.assign(new Error("400"), { response: { status: 400, data } });

describe("which screen a pairing code is for", () => {
  it("reads the server's answer, old wording included", () => {
    expect(screenForCode(rejected({ error: "Not a kiosk tablet", code: "DRIVER_TABLET" }))).toBe("driver");
    expect(screenForCode(rejected({ error: "Not a driver tablet", code: "KIOSK_TABLET" }))).toBe("kiosk");
    expect(screenForCode(rejected({ error: "Not a kiosk tablet" }))).toBe("driver");
    expect(screenForCode(rejected({ error: "Not a driver tablet" }))).toBe("kiosk");
  });

  it("leaves every other refusal alone", () => {
    expect(screenForCode(rejected({ error: "Invalid or expired pairing code" }))).toBeNull();
    expect(screenForCode(rejected({ error: "Pairing code expired" }))).toBeNull();
    expect(screenForCode(new Error("Network Error"))).toBeNull();
    expect(screenForCode(null)).toBeNull();
  });

  it("opens that screen with the code, which pairs it there", () => {
    expect(pairingPath("driver", " abcd2345efgh ")).toBe("/driver?code=ABCD2345EFGH");
    expect(pairingPath("kiosk", "AB&C")).toBe("/kiosk?code=AB%26C");
    expect(CHOOSE_SCREEN_PATH).toBe("/tablet?choose=1");
  });
});

function device(kiosk_type) {
  return {
    id: "dev1", status: "active", paired: false, pairing_code: "ABCDEFGHJKLM", kiosk_type, personal: false,
    company_id: "c1", company_name: "Coyaba", vehicle_id: "bus1",
    pairing_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}
async function pair(d, expected_type) {
  const db = {
    KioskDevice: { filter: vi.fn(async () => [d]), update: vi.fn(async () => ({})), get: vi.fn(async () => d) },
    DeviceCredential: { filter: vi.fn(async () => []), create: vi.fn(async (x) => x), update: vi.fn() },
    Vehicle: { get: vi.fn(async () => ({ driver_name: "" })) },
    Company: { get: vi.fn(async () => ({ logo_url: "" })) },
  };
  vi.mocked(createClientFromRequest).mockReturnValue({ asServiceRole: { entities: db } });
  const res = await handler(new Request("https://x/f", { method: "POST", body: JSON.stringify({ pairing_code: d.pairing_code, expected_type }) }));
  return { status: res.status, body: await res.json(), db };
}

describe("pairKioskDevice: a code typed on the wrong screen", () => {
  it("a driver tablet's code on the kiosk screen says it is for the driver screen, and isn't used up", async () => {
    const r = await pair(device("driver"), "kiosk");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Not a kiosk tablet", code: "DRIVER_TABLET" });
    expect(r.db.KioskDevice.update).not.toHaveBeenCalled();
    expect(r.db.DeviceCredential.create).not.toHaveBeenCalled();
  });

  it("a kiosk's code on the driver screen says it is for the kiosk screen, and isn't used up", async () => {
    for (const type of ["bus_boarding", "job_signing"]) {
      const r = await pair(device(type), "driver");
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: "Not a driver tablet", code: "KIOSK_TABLET" });
      expect(r.db.KioskDevice.update).not.toHaveBeenCalled();
    }
  });

  it("the same code on the right screen then pairs", async () => {
    const r = await pair(device("driver"), "driver");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kiosk_type: "driver", vehicle_id: "bus1" });
  });
});
