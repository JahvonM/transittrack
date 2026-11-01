// Kiosk protection in plain words, from what the McSween kiosk app reports
// (window.__ttNativeControl, from TabletControlPlugin.getState). It describes
// what Android says; it never claims protection the device doesn't have.
//
// tone: ok · limited · setup · unsupported · failed

export const KIOSK_CODE_TEXT = {
  DEVICE_OWNER_REQUIRED: "this device isn't set up as a managed kiosk (device owner). Set it up with the USB setup tool on a computer",
  KIOSK_RECOVERY_REQUIRED: "set an exit code first (Startup → Kiosk lock & exit code)",
  ALREADY_LOCKED: "another lock is already on. Close it first",
  ANDROID_ERROR: "Android refused to lock the screen. Restart the tablet and try again",
  STORAGE_ERROR: "the kiosk settings couldn't be saved on the device. Free some storage",
  UNSUPPORTED: "this Android version can't lock the screen (needs Android 8 or newer)",
  LOCK_RESTORE_FAILED: "the lock couldn't be put back after the app reopened. Restart the tablet",
};
export const kioskCodeText = (code) => KIOSK_CODE_TEXT[code] || (code ? `code ${String(code).slice(0, 40)}` : "");

// The same states for Admin, from what a tablet last reported (helper_health).
export function protectionFromHealth(h) {
  if (!h || h.management_available !== true) return protectionState(null, null);
  return protectionState({ defaultHome: h.default_home === true }, {
    available: true, deviceOwner: h.management_owner === true, locked: h.management_locked === true,
    kioskAvailable: h.kiosk_available !== false, kioskEnabled: h.kiosk_enabled === true, kioskRecoveryReady: h.kiosk_recovery_ready === true,
    kioskMaintenance: h.kiosk_maintenance === true, kioskLocked: h.kiosk_locked === true, kioskError: h.kiosk_error || "",
  });
}
export const PROTECTION_LABEL = { ok: "Kiosk protection active", limited: "Limited protection", setup: "Setup required", unsupported: "Not reported", failed: "Protection failed" };

export function protectionState(recovery = null, control = typeof window !== "undefined" ? window.__ttNativeControl : null) {
  if (!control?.available) {
    return { tone: "unsupported", text: "Not reported: this screen isn't running in the McSween kiosk app, so the app can't see or set the lock. If another kiosk app (such as FreeKiosk) locks this tablet, check that app's own settings." };
  }
  const error = control.kioskError || "";
  if (control.kioskMaintenance) return { tone: "limited", text: "Maintenance: the kiosk lock is paused for up to 10 minutes, then comes back by itself." };
  if (control.kioskEnabled && control.kioskLocked) return { tone: "ok", text: "Managed kiosk protection active: the screen is locked to this app." };
  if (control.kioskEnabled) return { tone: "failed", text: `Protection failed: kiosk mode is on but the screen isn't locked${error ? `: ${kioskCodeText(error)}` : ". Restart the tablet"}.` };
  if (control.kioskAvailable === false) return { tone: "unsupported", text: `Unsupported: ${KIOSK_CODE_TEXT.UNSUPPORTED}.` };
  if (!control.deviceOwner) {
    if (control.locked) return { tone: "limited", text: "Limited protection: the screen is pinned, but this device isn't a managed kiosk, so it can be unpinned." };
    if (recovery?.defaultHome) return { tone: "limited", text: "Limited protection: the app opens when the tablet starts (Home app), but passengers can leave it." };
    return { tone: "setup", text: `Setup required: ${KIOSK_CODE_TEXT.DEVICE_OWNER_REQUIRED}.` };
  }
  if (!control.kioskRecoveryReady) return { tone: "setup", text: `Setup required: ${KIOSK_CODE_TEXT.KIOSK_RECOVERY_REQUIRED}.` };
  return { tone: "setup", text: `Kiosk lock is off${error ? ` (last try: ${kioskCodeText(error)})` : ""}. Turn it on in Startup → Kiosk lock & exit code.` };
}
