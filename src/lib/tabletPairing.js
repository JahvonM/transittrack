import { errorData } from "@/lib/requestError";

// A pairing code typed on the wrong screen of the tablet app: a driver
// tablet's code on the kiosk screen, or a kiosk's code on the driver screen.
// pairKioskDevice says which screen the code is for, without using the code
// up, so the app can open that screen and pair there. null: anything else.
export function screenForCode(error) {
  const data = errorData(error);
  if (data.code === "DRIVER_TABLET" || data.error === "Not a kiosk tablet") return "driver";
  if (data.code === "KIOSK_TABLET" || data.error === "Not a driver tablet") return "kiosk";
  return null;
}

// That screen with the code: /kiosk and /driver both pair from ?code=.
export function pairingPath(screen, code) {
  return `/${screen}?code=${encodeURIComponent(String(code || "").trim().toUpperCase())}`;
}

// The tablet app's "What is this tablet for?" screen.
export const CHOOSE_SCREEN_PATH = "/tablet?choose=1";
