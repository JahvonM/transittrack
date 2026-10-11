// Backup boarding over Bluetooth.
//
// The boarding tablet's TransitTrack Helper (1.13+) advertises this service
// under the bus's name, at low power so only phones near the door see it. A
// passenger with the app open taps "Board by Bluetooth", picks the bus, and
// the phone writes their boarding code, the same "tt-code:..." their boarding
// QR holds. The tablet passes it to the boarding screen, which checks it with
// the server exactly like a scanned QR and asks the passenger to confirm
// Boarding or Exiting on the tablet.
//
// Two ways to reach Bluetooth from the phone:
// - the TransitTrack phone app (iPhone and Android): the native Bluetooth
//   plugin, when the installed app includes it;
// - Chrome on Android: Web Bluetooth.
import { Capacitor } from "@capacitor/core";

export const BLE_SERVICE = "7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c01";
export const BLE_CODE = "7a1c0d3e-5b6f-4c2a-9e41-2f7d8b6a1c02";

const named = (name, message = name) => Object.assign(new Error(message), { name });

// True only inside the phone app, and only when the installed copy was built
// with the Bluetooth plugin (an older install loads the new pages but can't
// use Bluetooth, so it gets the "show your QR" note instead).
export function nativeBluetoothAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BluetoothLe");
  } catch {
    return false;
  }
}

export function bluetoothBoardingSupported() {
  if (nativeBluetoothAvailable()) return true;
  return typeof navigator !== "undefined" && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function";
}

// Phone side. Must run from a tap (the phone shows its own list of buses).
export async function sendBoardingCodeByBluetooth(qrToken, bluetooth) {
  if (typeof qrToken !== "string" || !qrToken) throw named("NoCode", "No boarding code");
  if (!bluetooth && nativeBluetoothAvailable()) {
    const { BleClient } = await import("@capacitor-community/bluetooth-le");
    return sendByNativeBluetooth(qrToken, BleClient, Capacitor.getPlatform());
  }
  bluetooth = bluetooth || (typeof navigator !== "undefined" ? navigator.bluetooth : null);
  if (!bluetooth) throw named("Unsupported");
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

// The phone app's Bluetooth plugin reports problems as plain messages; these
// are turned into the same names Web Bluetooth uses, plus a few of its own.
export function nativeBluetoothErrorName(message, stage) {
  const text = String(message || "").toLowerCase();
  if (text.includes("cancel")) return "NotFoundError";
  if (text.includes("no device found")) return "NoBusFound";
  if (text.includes("permission") || text.includes("unauthorized")) return "NativeDenied";
  if (text.includes("not supported") || text.includes("unsupported") || text.includes("not available")) return "Unsupported";
  if (stage === "connect" || stage === "write") return "NetworkError";
  return "Other";
}

export async function sendByNativeBluetooth(qrToken, ble, platform) {
  if (typeof qrToken !== "string" || !qrToken) throw named("NoCode", "No boarding code");
  let stage = "start";
  let deviceId = null;
  try {
    await ble.initialize({ androidNeverForLocation: true });
    if (!(await ble.isEnabled())) {
      // Android can ask to switch Bluetooth on; iPhone can't, so say how.
      if (platform === "android") {
        try { await ble.requestEnable(); } catch { /* declined */ }
      }
      if (!(await ble.isEnabled())) throw named("BluetoothOff");
    }
    stage = "pick";
    const device = await ble.requestDevice({ services: [BLE_SERVICE] });
    deviceId = device.deviceId;
    stage = "connect";
    await ble.connect(deviceId);
    stage = "write";
    const bytes = new TextEncoder().encode(`tt-code:${qrToken}`);
    await ble.write(deviceId, BLE_SERVICE, BLE_CODE, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return { bus: device.name || "the bus" };
  } catch (error) {
    if (error?.name === "BluetoothOff") throw error;
    throw Object.assign(named(nativeBluetoothErrorName(error?.message, stage), error?.message || "Bluetooth failed"), { cause: error });
  } finally {
    if (deviceId) {
      try { await ble.disconnect(deviceId); } catch { /* already gone */ }
    }
  }
}

export function bluetoothProblem(error) {
  const name = error?.name || "";
  if (name === "NotFoundError") return "No bus was chosen. Stand at the bus door with Bluetooth on, then tap the button again and pick your bus.";
  if (name === "NoBusFound") return "No bus tablet found nearby. Stand at the bus door, check Bluetooth is on, and try again.";
  if (name === "NetworkError") return "Couldn't reach the bus tablet. Move closer to the door and try again.";
  if (name === "BluetoothOff") return "Bluetooth is off on this phone. Turn it on (swipe down for Control Center on iPhone), then tap the button again.";
  if (name === "NativeDenied") return "TransitTrack isn't allowed to use Bluetooth. Turn it on in your phone's Settings under TransitTrack, or show your QR instead.";
  if (name === "Unsupported") return "This phone can't board by Bluetooth. Show your boarding QR or type your code instead.";
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
