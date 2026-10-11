// Backup boarding over Bluetooth.
//
// The boarding tablet's TransitTrack Helper (1.13+) advertises this service
// under the bus's name, at low power so only phones near the door see it. A
// passenger with the app open taps "Board by Bluetooth" (Chrome on Android:
// Web Bluetooth), picks the bus, and the phone writes their boarding code,
// the same "tt-code:..." their boarding QR holds. The tablet passes it to the
// boarding screen, which checks it with the server exactly like a scanned QR
// and asks the passenger to confirm Boarding or Exiting on the tablet.
export const BLE_SERVICE = "7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c01";
export const BLE_CODE = "7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c02";

export function bluetoothBoardingSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function";
}

// Phone side. Must run from a tap (the browser shows its own list of buses).
export async function sendBoardingCodeByBluetooth(qrToken, bluetooth = navigator.bluetooth) {
  if (typeof qrToken !== "string" || !qrToken) throw Object.assign(new Error("No boarding code"), { name: "NoCode" });
  const device = await bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
  const server = await device.gatt.connect();
  try {
    const service = await server.getPrimaryService(BLE_SERVICE);
    const code = await service.getCharacteristic(BLE_CODE);
    const bytes = new TextEncoder().encode(`tt-code:${qrToken}`);
    if (typeof code.writeValueWithResponse === "function") await code.writeValueWithResponse(bytes);
    else await code.writeValue(bytes);
    return { bus: device.name || "the bus" };
  } finally {
    try { device.gatt.disconnect(); } catch { /* already gone */ }
  }
}

export function bluetoothProblem(error) {
  const name = error?.name || "";
  if (name === "NotFoundError") return "No bus was chosen. Stand at the bus door with Bluetooth on, then tap the button again and pick your bus.";
  if (name === "NetworkError") return "Couldn't reach the bus tablet. Move closer to the door and try again.";
  if (name === "SecurityError" || name === "NotAllowedError") return "Bluetooth is blocked for this app in Chrome. Allow it in Chrome's site settings, or show your QR instead.";
  if (name === "NoCode") return "Your boarding code isn't ready yet. Try again in a moment.";
  return "Couldn't send by Bluetooth. Show your boarding QR or type your code instead.";
}

// Tablet side: codes the helper delivered while nothing was listening wait in
// window.__ttBleInbox for 30 seconds.
const seen = new Set();
export function takeBleCodes(now = Date.now()) {
  const inbox = typeof window !== "undefined" && Array.isArray(window.__ttBleInbox) ? window.__ttBleInbox : [];
  const out = [];
  for (const item of inbox) {
    if (!item || typeof item.code !== "string" || !item.id || seen.has(item.id)) continue;
    if (!(now - item.at < 30000)) continue;
    seen.add(item.id);
    out.push(item.code);
  }
  return out;
}
export function markBleCodeSeen(item) {
  if (!item?.id || seen.has(item.id)) return false;
  seen.add(item.id);
  return true;
}
