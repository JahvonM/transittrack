export const KIOSK_LAYOUT_KEY = "tt_kiosk_layout";

// Validators: small fare-validator devices with the card reader above the
// screen. Recognised from the model the kiosk app reports; an administrator
// can always choose the layout instead (Kiosk tablets → the tablet).
const VALIDATOR_MODELS = [/\bT10\b/i];
export const isValidatorModel = (model) => typeof model === "string" && VALIDATOR_MODELS.some((re) => re.test(model));

// The boarding screen layout: the tablet's setting in Admin, else the choice
// made on the tablet, else from the device (a validator model, or a phone-
// sized screen).
export function boardingLayout(deviceLayout, localLayout, width, model = "") {
  const choice = deviceLayout && deviceLayout !== "auto" ? deviceLayout : localLayout;
  if (choice === "validator") return "validator";
  if (choice === "phone") return "phone";
  if (choice === "tablet") return "tablet";
  if (isValidatorModel(model)) return "validator";
  return width < 600 ? "phone" : "tablet";
}
export function rememberKioskLayout(layout, storage = globalThis.localStorage) {
  if (!["phone","tablet","validator","auto"].includes(layout)) return;
  try { storage.setItem(KIOSK_LAYOUT_KEY,layout); } catch { /* this screen still works */ }
}

// Where a passenger taps their card on this device, for the hint on the
// boarding screen. "auto" follows the layout.
export const NFC_SPOTS = ["auto", "above_screen", "back_top", "back_middle", "external"];
export const NFC_SPOT_LABEL = {
  auto: "Automatic (from the screen layout)",
  above_screen: "Above the screen (validator)",
  back_top: "Back of the phone, near the top",
  back_middle: "Back of the phone, in the middle",
  external: "Separate card reader beside the screen",
};
export function nfcHint(layout, spot = "auto") {
  const where = NFC_SPOTS.includes(spot) && spot !== "auto" ? spot
    : layout === "validator" ? "above_screen" : layout === "phone" ? "back_middle" : "external";
  return {
    above_screen: { where, arrow: "up", title: "Tap your card above the screen", detail: "Hold it flat on the reader until you hear the tone." },
    back_top: { where, arrow: "back", title: "Hold your card to the back of the phone, near the top", detail: "Hold it flat and still for a moment." },
    back_middle: { where, arrow: "back", title: "Hold your card to the back of the phone", detail: "Flat against the middle, and still for a moment." },
    external: { where, arrow: "side", title: "Tap your card on the reader", detail: "Hold it flat on the reader until you hear the tone." },
  }[where];
}
