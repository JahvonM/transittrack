import { describe, it, expect, vi } from "vitest";
vi.mock("npm:@base44/sdk@0.8.44", () => ({ createClientFromRequest: vi.fn() }));
vi.mock("../../../base44/shared/forwardToSupabase.ts", () => ({ forwardToSupabase: vi.fn(async () => null) }));
vi.mock("../../../base44/shared/durableOperation.ts", () => ({ durableWritesEnabled: () => false, acquireOperation: vi.fn(), operationHash: vi.fn() }));
import handler from "../../../base44/functions/pairKioskDevice/entry.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

// A bus tablet's pairing code lasts 15 minutes; a driver's own phone's code
// lasts 7 days, because the driver installs the app from the store first.

const DAY = 86400_000;
function device(lastsMs, personal) {
  return {
    id: "dev1", status: "active", paired: false, pairing_code: "ABCDEFGHJKLM", kiosk_type: "driver", personal,
    company_id: "c1", company_name: "Coyaba", vehicle_id: personal ? "" : "bus1", driver_name: "Ana Joseph",
    pairing_expires_at: new Date(Date.now() + lastsMs).toISOString(),
  };
}
async function pair(d) {
  const db = {
    KioskDevice: { filter: vi.fn(async () => [d]), update: vi.fn(async () => ({})), get: vi.fn(async () => d) },
    DeviceCredential: { filter: vi.fn(async () => []), create: vi.fn(async (x) => x), update: vi.fn() },
    Vehicle: { get: vi.fn(async () => ({ driver_name: "" })) },
    Company: { get: vi.fn(async () => ({ logo_url: "" })) },
  };
  vi.mocked(createClientFromRequest).mockReturnValue({ asServiceRole: { entities: db } });
  const res = await handler(new Request("https://x/f", { method: "POST", body: JSON.stringify({ pairing_code: d.pairing_code, expected_type: "driver" }) }));
  return { status: res.status, body: await res.json(), db };
}

describe("pairing code lifetime", () => {
  it("a driver's phone pairs with the 7-day code Admin gives it", async () => {
    const r = await pair(device(7 * DAY - 60_000, true));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ personal: true, driver_name: "Ana Joseph" });
    expect(r.body.device_token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("a bus tablet's code still lasts 15 minutes at most", async () => {
    expect((await pair(device(14 * 60_000, false))).status).toBe(200);
    expect((await pair(device(2 * 3600_000, false))).body.error).toBe("Pairing code expired");
  });

  it("a phone code set to last longer than 7 days, or already past, is refused", async () => {
    expect((await pair(device(8 * DAY, true))).status).toBe(410);
    expect((await pair(device(-60_000, true))).status).toBe(410);
  });
});
