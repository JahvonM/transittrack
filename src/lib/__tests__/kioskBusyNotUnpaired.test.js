import { expect, it } from "vitest";
import { load, mock, request } from "../../../security-tests/helpers.js";

// Under load Base44 refuses reads with 429. The boarding tablet's device check
// answered that as "Invalid or unpaired kiosk device" (401): the boarding
// screen restarted itself and saved boardings waited behind the refusal.
const busyOn = (sdk, table, method, error) => {
 const original = sdk.asServiceRole.entities;
 sdk.asServiceRole.entities = new Proxy(original, { get: (target, name) => {
  const entity = target[name];
  return name === table ? { ...entity, [method]: async () => { throw error; } } : entity;
 } });
};
const checkIn = (sdk) => load("kioskCheckIn", sdk).default(request({ device_id: "tablet", action: "offline_directory" }));

it.each([
 ["sdk", { status: 429 }],
 ["axios", { response: { status: 429 } }],
])("a busy platform is busy, not unpaired (%s)", async (_shape, error) => {
 const sdk = mock(null);
 busyOn(sdk, "KioskDevice", "get", error);
 const response = await checkIn(sdk);
 expect(response.status).toBe(429);
 expect(await response.json()).toEqual({ error: "Server is busy. Please try again shortly." });
});

it("a busy credential check is busy, not unpaired", async () => {
 const sdk = mock(null);
 busyOn(sdk, "DeviceCredential", "filter", { status: 429 });
 expect((await checkIn(sdk)).status).toBe(429);
});

it("a server error is a server error, not unpaired", async () => {
 const sdk = mock(null);
 busyOn(sdk, "KioskDevice", "get", { status: 503, message: "Service unavailable" });
 expect((await checkIn(sdk)).status).toBe(503);
});

it("a device that does not exist is still unpaired", async () => {
 const sdk = mock(null);
 busyOn(sdk, "KioskDevice", "get", { status: 404 });
 const response = await checkIn(sdk);
 expect(response.status).toBe(401);
 expect(await response.json()).toEqual({ error: "Invalid or unpaired kiosk device" });
});
