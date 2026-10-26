import { errorData, httpStatus } from "@/lib/requestError";
import { forgetPin } from "@/lib/offlinePin";

// A driver's own phone (the store app) belongs to the driver and picks the
// bus before each shift. These helpers keep that flow's rules in one place.

export const isOwnDevice = (session) => session?.personal === true;

// A phone that hasn't chosen a bus yet (or released it) shows the bus list.
export const needsBusChoice = (session) => isOwnDevice(session) && !session?.vehicle;

// Plain words for what the server said about choosing or leaving a bus.
export function busChoiceMessage(error, fallback = "Something went wrong. Try again.") {
  const data = errorData(error);
  if (data.code === "BUS_BUSY") return data.error || "That bus already has a driver on shift. Choose another bus.";
  if (data.code === "SHIFT_OPEN") return data.error || "End your shift before changing bus.";
  if (data.code === "DEVICE_ACCESS_REQUIRED") return "This phone isn't connected any more. Ask the office for a new code.";
  const status = httpStatus(error);
  if (status && status < 500 && typeof data.error === "string" && data.error) return data.error;
  return fallback;
}

// The PIN saved for offline unlock and the driver grant both belong to the
// old bus, so they go when the phone changes bus.
export function forgetBusAccess(deviceId) {
  if (!deviceId) return;
  forgetPin(deviceId);
  try { localStorage.removeItem("tt_driver_grant_" + deviceId); } catch { /* storage unavailable */ }
}
