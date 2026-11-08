import { errorData, httpStatus } from "@/lib/requestError";
import { forgetPin } from "@/lib/offlinePin";

// A driver's own phone (the store app) belongs to the driver and picks the
// bus before each shift. These helpers keep that flow's rules in one place.

export const isOwnDevice = (session) => session?.personal === true;

// McSween Driver runs on the driver's phone or tablet; screens name it.
// 600 points on the short side is where Android and iPad call it a tablet.
export function ownDeviceNoun(view = globalThis.screen) {
  const short = Math.min(Number(view?.width) || 0, Number(view?.height) || 0);
  return short >= 600 ? "tablet" : "phone";
}

// A phone that hasn't chosen a bus yet (or released it) shows the bus list.
export const needsBusChoice = (session) => isOwnDevice(session) && !session?.vehicle;

// Plain words for what the server said about choosing or leaving a bus.
export function busChoiceMessage(error, fallback = "Something went wrong. Try again.") {
  const data = errorData(error);
  if (data.code === "BUS_BUSY") return data.error || "That bus already has a driver on shift. Choose another bus.";
  if (data.code === "SHIFT_OPEN") return data.error || "End your shift before changing bus.";
  if (data.code === "DEVICE_ACCESS_REQUIRED") return `This ${ownDeviceNoun()} isn't connected any more. Ask the office for a new code.`;
  const status = httpStatus(error);
  if (status && status < 500 && typeof data.error === "string" && data.error) return data.error;
  return fallback;
}

// The PIN saved for offline unlock and the driver grant both belong to the
// old bus, so they go when the phone (or a bus's tablet) changes bus.
export function forgetBusAccess(deviceId) {
  if (!deviceId) return;
  forgetPin(deviceId);
  try { localStorage.removeItem("tt_driver_grant_" + deviceId); } catch { /* storage unavailable */ }
}

// The bus this device last opened on. When the office moves a tablet to
// another bus, the next check-in names a different bus, and the tablet locks
// and asks for the new bus's PIN.
const BUS_KEY = (deviceId) => "tt_driver_bus_" + deviceId;
export function knownBus(deviceId) {
  try { return localStorage.getItem(BUS_KEY(deviceId)) || ""; } catch { return ""; }
}
export function rememberBus(deviceId, busId) {
  if (!deviceId || !busId) return;
  try { localStorage.setItem(BUS_KEY(deviceId), busId); } catch { /* storage unavailable */ }
}

// A bus's own driver tablet (not a driver's phone) can switch bus: pick the
// bus it's in now and enter that bus's PIN.
export const canSwitchBus = (session) => !!session && !isOwnDevice(session);
