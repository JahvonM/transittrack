// Setting up a kiosk phone or tablet from Admin over a USB cable (Admin →
// Kiosk tablets → Set up a device). The browser talks to Android's USB
// debugging directly (src/lib/usbAdb.js); this file reads Android's answers
// and turns them into plain words. Nothing here removes accounts, resets a
// device or takes ownership from another app.

export const KIOSK_PACKAGE = "com.transittrack.app";
export const KIOSK_ADMIN = `${KIOSK_PACKAGE}/.TransitDeviceAdminReceiver`;
export const KIOSK_ACTIVITY = `${KIOSK_PACKAGE}/.MainActivity`;
// Full kiosk locking (lock task with a device owner) needs Android 8.
export const MIN_OWNER_API = 26;

const lines = (text) => String(text || "").split(/\r?\n/);

// The device owner's package from `dumpsys device_policy`, or "". Only an
// explicit device-owner section counts, never an active admin or a profile
// owner (same reading as tools/kiosk/McSween-Kiosk-Setup.ps1).
export function ownerPackage(text) {
  const all = lines(text);
  for (let i = 0; i < all.length; i++) {
    if (!/^\s*(?:Device Owner|mDeviceOwner)\b/.test(all[i])) continue;
    if (/[:=]\s*(?:null|none)\s*$/i.test(all[i])) continue;
    for (let j = i; j < Math.min(all.length, i + 12); j++) {
      if (j > i && (/^\s*$/.test(all[j]) || /^\s*(?:Profile Owner|Active admins|Enabled Device Admins)\b/.test(all[j]))) break;
      const component = all[j].match(/ComponentInfo\{([^/\s}]+)\/[^}]+\}/);
      if (component) return component[1];
      const pkg = all[j].match(/^\s*package=([A-Za-z0-9_.]+)\s*$/);
      if (pkg) return pkg[1];
    }
  }
  return "";
}

// Accounts signed in on the device, from `dumpsys account`. Android refuses a
// new device owner while any exist (a Google account, WhatsApp, Samsung…).
export function deviceAccounts(text) {
  const seen = new Map();
  for (const m of String(text || "").matchAll(/Account \{name=([^,}]*), type=([^}]+)\}/g)) {
    const key = `${m[1]}|${m[2]}`;
    if (!seen.has(key)) seen.set(key, { name: m[1].trim(), type: m[2].trim() });
  }
  return [...seen.values()];
}

// What the account type means to a person.
export function accountLabel({ name, type }) {
  const kind = {
    "com.google": "Google account", "com.whatsapp": "WhatsApp", "com.samsung.android.mobileservice": "Samsung account",
    "com.osp.app.signin": "Samsung account", "com.microsoft.workaccount": "Microsoft work account", "com.facebook.auth.login": "Facebook",
  }[type] || type;
  return name ? `${kind} (${name})` : kind;
}

// People on the device, from `pm list users`: a guest or second user also
// stops Android from accepting a device owner.
export function deviceUsers(text) {
  return [...String(text || "").matchAll(/UserInfo\{(\d+):([^:}]*):/g)].map((m) => ({ id: Number(m[1]), name: m[2] }));
}

// The kiosk app's installed version from `dumpsys package <name>`, or "".
export function installedVersion(text) {
  const name = String(text || "").match(/versionName=([^\s]+)/);
  return name ? name[1] : "";
}

// What `dpm set-device-owner` said, in plain words.
export function ownerResult(text) {
  const out = String(text || "");
  if (/Success:\s*Device owner set/i.test(out)) return { ok: true, message: "McSween Kiosk is now the owner of this device." };
  if (/already some accounts/i.test(out)) return { ok: false, code: "accounts", message: "Android says there are still accounts on the device. Remove every account in Settings → Accounts, then try again." };
  if (/several users|already (?:some|multiple) users/i.test(out)) return { ok: false, code: "users", message: "The device has a guest or a second user. Remove them in Settings → System → Multiple users, then try again." };
  if (/device owner is already set|already has a device owner/i.test(out)) return { ok: false, code: "owner", message: "Another app is already the owner of this device. This page won't take over from it." };
  if (/Unknown admin/i.test(out)) return { ok: false, code: "not_installed", message: "Install the McSween Kiosk app first." };
  if (/already provisioned|already set up/i.test(out)) return { ok: false, code: "provisioned", message: "Android won't accept an owner on this device as it is. It usually means an account was used on it. Check Settings → Accounts is empty, then try again." };
  return { ok: false, code: "unknown", message: `Android didn't accept it: ${out.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || "no answer"}.` };
}

// What an APK install said, in plain words.
export function installResult(text) {
  const out = String(text || "");
  if (/^\s*Success\s*$/m.test(out)) return { ok: true, message: "The app is installed." };
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(out)) {
    return { ok: false, code: "signature", message: "This file was made on a different PC from the app already on the device. Use the file from your usual PC. Don't uninstall the app on the device: that would lose its pairing." };
  }
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/i.test(out)) return { ok: false, code: "older", message: "This file is older than the app already on the device. Choose the newest file." };
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/i.test(out)) return { ok: false, code: "storage", message: "The device is out of storage. Free some space, then try again." };
  if (/INSTALL_PARSE_FAILED|INSTALL_FAILED_INVALID_APK/i.test(out)) return { ok: false, code: "bad_file", message: "That file isn't a working app file. Choose the .apk file again." };
  return { ok: false, code: "unknown", message: `The install didn't finish: ${out.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || "no answer"}.` };
}

// What stands between this device and a working kiosk, from what was read.
// Each item: { key, ok, title, detail }.
export function readiness(info) {
  const owner = info.owner === KIOSK_PACKAGE;
  const foreign = info.owner && !owner;
  const items = [
    { key: "android", ok: info.api >= MIN_OWNER_API, title: `Android ${info.release || "?"}`, detail: info.api >= MIN_OWNER_API ? "New enough for full kiosk mode." : "Full kiosk mode needs Android 8 or newer." },
    { key: "app", ok: !!info.version, title: info.version ? `McSween Kiosk ${info.version} installed` : "McSween Kiosk isn't installed", detail: info.version ? "Install a newer file to update it." : "Choose the app file below to install it." },
  ];
  if (owner) items.push({ key: "owner", ok: true, title: "McSween Kiosk is the owner", detail: "Kiosk lock, restart and Wi-Fi controls all work." });
  else if (foreign) items.push({ key: "owner", ok: false, title: `Another app is the owner (${info.owner})`, detail: "Remove it in that app first. This page won't take over from it." });
  else {
    items.push({ key: "accounts", ok: info.accounts.length === 0, title: info.accounts.length ? `${info.accounts.length} account${info.accounts.length === 1 ? "" : "s"} on the device` : "No accounts on the device", detail: info.accounts.length ? `Remove in Settings → Accounts: ${info.accounts.map(accountLabel).join(", ")}.` : "Ready to make McSween Kiosk the owner." });
    if (info.users.length > 1) items.push({ key: "users", ok: false, title: `${info.users.length} users on the device`, detail: "Remove the guest or extra users in Settings → System → Multiple users." });
  }
  return items;
}

export const canTakeOwnership = (info) => !!info && info.api >= MIN_OWNER_API && !!info.version && !info.owner && info.accounts.length === 0 && info.users.length <= 1;

// A browser problem while connecting, in plain words.
export function connectProblem(error) {
  const text = `${error?.name || ""} ${error?.message || error || ""}`;
  if (/DeviceBusy|busy|claimInterface|Unable to claim/i.test(text)) {
    return "Another program on this PC is using the device. Close Android Studio and the old Kiosk Setup tool. If it still says this, open Task Manager, end adb.exe, then unplug the device and plug it back in.";
  }
  if (/NotFoundError|No device selected/i.test(text)) return "No device was chosen. Click Connect and pick the phone or tablet in the list.";
  if (/SecurityError|Access denied/i.test(text)) return "Windows didn't let the browser use the device. Unplug it, plug it back in and try again. If it keeps happening, install the Google USB driver.";
  if (/auth|timed? ?out/i.test(text)) return "The device didn't answer. Unlock it and tap Allow on the \"Allow USB debugging?\" message, then click Connect again.";
  return "Couldn't connect to the device. Unplug it, plug it back in, and make sure USB debugging is on.";
}
