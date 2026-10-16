export const KIOSK_LAYOUT_KEY = "tt_kiosk_layout";
export function boardingLayout(deviceLayout, localLayout, width) {
  const choice = deviceLayout && deviceLayout !== "auto" ? deviceLayout : localLayout;
  return choice === "phone" || (choice !== "tablet" && width < 600) ? "phone" : "tablet";
}
export function rememberKioskLayout(layout, storage = globalThis.localStorage) {
  if (!["phone","tablet","auto"].includes(layout)) return;
  try { storage.setItem(KIOSK_LAYOUT_KEY,layout); } catch { /* this screen still works */ }
}
