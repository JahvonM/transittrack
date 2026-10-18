import { Capacitor, registerPlugin } from "@capacitor/core";
const BoardingBluetooth = registerPlugin("BoardingBluetooth");
export const nativeBoardingBluetoothAvailable = () => Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("BoardingBluetooth");
export async function boardingBluetoothState() {
  if (!nativeBoardingBluetoothAvailable()) return { available: false, enabled: false };
  try { return await BoardingBluetooth.getState(); } catch { return { available: false, enabled: false }; }
}
export const enableBoardingBluetooth = enabled => BoardingBluetooth.setEnabled({ enabled: !!enabled });
export const retryBoardingBluetooth = () => BoardingBluetooth.retry();
export const openBoardingBluetoothSettings = () => BoardingBluetooth.openSettings();
export function onBoardingBluetoothState(callback) {
  let stopped = false, handle;
  if (nativeBoardingBluetoothAvailable()) void BoardingBluetooth.addListener("receiverState", value => {
    if (!stopped) callback(value);
  }).then(h => { if (stopped) void h.remove(); else handle = h; }).catch(() => {});
  return () => { stopped = true; void handle?.remove(); };
}
export function validNativeBoardingCode(value, now = Date.now()) {
  return typeof value?.id === "string" && /^ble-native-[a-z0-9-]{16,64}$/i.test(value.id)
    && !/\s/.test(value.id)
    && typeof value.code === "string" && value.code.startsWith("tt-code:")
    && value.code.length > 8 && value.code.length <= 200 && !/[^\x21-\x7e]/.test(value.code)
    && Number.isFinite(value.at) && now - value.at < 30000 && value.at <= now + 2000;
}
// No disk inbox: native waits until this listener is installed and the boarding
// page is mounted. Code verification and Boarding/Exiting remain page actions.
export function startBoardingBluetooth(name, onCode) {
  if (!nativeBoardingBluetoothAvailable()) return () => {};
  let stopped = false, handle;
  const seen = new Map();
  void BoardingBluetooth.addListener("boardingCode", value => {
    const now = Date.now();
    if (stopped || !validNativeBoardingCode(value, now)) return;
    for (const [id, at] of seen) if (now - at >= 30000) seen.delete(id);
    if (seen.has(value.id)) return;
    seen.set(value.id, now);
    while (seen.size > 64) seen.delete(seen.keys().next().value);
    onCode(value.code);
  }).then(async h => {
    if (stopped) { await h.remove(); return; }
    handle = h;
    await BoardingBluetooth.setReady({ ready: true, name: String(name || "").slice(0, 80) });
  }).catch(() => {});
  return () => {
    stopped = true;
    void BoardingBluetooth.setReady({ ready: false }).catch(() => {});
    void handle?.remove();
    seen.clear();
  };
}
