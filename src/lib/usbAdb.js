// Android USB debugging from the browser (Chrome or Edge, using WebUSB), for
// Admin → Kiosk tablets → Set up a device. Loaded only when someone clicks
// Connect. Built on Tango (@yume-chan/adb, MIT).
//
// The first time, Android shows "Allow USB debugging?" with this browser's
// key; ticking "Always allow from this computer" skips it next time. The key
// stays in this browser (IndexedDB) and never leaves the PC.
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { PackageManager } from "@yume-chan/android-bin";
import {
  KIOSK_ACTIVITY, KIOSK_ADMIN, KIOSK_PACKAGE, deviceAccounts, deviceUsers, installResult, installedVersion, ownerPackage, ownerResult,
} from "@/lib/usbSetup";

export const usbSupported = () => typeof navigator !== "undefined" && !!navigator.usb && !!AdbDaemonWebUsbDeviceManager.BROWSER;

// Ask the person to pick the device, then connect. Resolves to a session, or
// null when they closed the picker.
export async function connectUsbDevice() {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) throw new Error("WebUSB not available");
  const device = await manager.requestDevice();
  if (!device) return null;
  const connection = await device.connect();
  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial, connection, credentialStore: new AdbWebCredentialStore("McSween Transport Admin"),
  });
  const adb = new Adb(transport);
  const shell = (args) => adb.subprocess.noneProtocol.spawnWaitText(args);
  const prop = async (key) => (await adb.getProp(key)).trim();

  return {
    serial: device.serial,
    async read() {
      const [manufacturer, model, release, sdk, pkg, policy, accounts, users] = await Promise.all([
        prop("ro.product.manufacturer"), prop("ro.product.model"), prop("ro.build.version.release"), prop("ro.build.version.sdk"),
        shell(["dumpsys", "package", KIOSK_PACKAGE]), shell(["dumpsys", "device_policy"]),
        shell(["dumpsys", "account"]), shell(["pm", "list", "users"]),
      ]);
      return {
        serial: device.serial,
        name: [manufacturer, model].filter(Boolean).join(" ") || device.name || "Android device",
        release, api: Number.parseInt(sdk, 10) || 0,
        version: installedVersion(pkg), owner: ownerPackage(policy),
        accounts: deviceAccounts(accounts), users: deviceUsers(users),
      };
    },
    // Install or update the kiosk app from an .apk file the person chose.
    async install(file) {
      try {
        await new PackageManager(adb).installStream(file.size, file.stream());
        return installResult("Success");
      } catch (error) {
        return installResult(error?.message || String(error));
      }
    },
    async takeOwnership() {
      return ownerResult(await shell(["dpm", "set-device-owner", KIOSK_ADMIN]));
    },
    async openApp() {
      const out = await shell(["am", "start", "-n", KIOSK_ACTIVITY]);
      return !/^\s*(Error:|Exception occurred)/im.test(out);
    },
    async close() {
      try { await adb.close(); } catch { /* already gone */ }
    },
  };
}
