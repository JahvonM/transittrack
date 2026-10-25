import { describe, it, expect } from "vitest";
import {
  KIOSK_ADMIN, KIOSK_PACKAGE, accountLabel, canTakeOwnership, connectProblem, deviceAccounts, deviceUsers, installResult,
  installedVersion, ownerPackage, ownerResult, readiness,
} from "@/lib/usbSetup";

// Admin → Kiosk tablets → Set up a device (USB from the browser).

const POLICY_FREEKIOSK = `Current Device Policy Manager state:
  Immutable state:
    mHasFeature=true
  Device Owner:
    admin=ComponentInfo{com.freekiosk/com.freekiosk.DeviceAdminReceiver}
    name=
    package=com.freekiosk
  Profile Owner (User 0):
    admin=ComponentInfo{com.other/com.other.Admin}`;
const POLICY_NONE = `Current Device Policy Manager state:
  Enabled Device Admins (User 0, provisioningState: 0):
    com.transittrack.app/.TransitDeviceAdminReceiver:
      uid=10123`;
const ACCOUNTS = `Accounts: 2
    Account {name=ana@gmail.com, type=com.google}
    Account {name=+14735550101, type=com.whatsapp}

  Active Sessions: 0
  RegisteredServicesCache: 3 services
  Account visibility:
    Account {name=ana@gmail.com, type=com.google}`;

describe("reading Android's answers", () => {
  it("finds the device owner, never a profile owner or a plain admin", () => {
    expect(ownerPackage(POLICY_FREEKIOSK)).toBe("com.freekiosk");
    expect(ownerPackage(POLICY_NONE)).toBe("");
    expect(ownerPackage("  Device Owner: null")).toBe("");
    expect(ownerPackage(`  Device Owner:\n    admin=ComponentInfo{${KIOSK_PACKAGE}/${KIOSK_PACKAGE}.TransitDeviceAdminReceiver}`)).toBe(KIOSK_PACKAGE);
  });

  it("lists accounts once each, and says what they are", () => {
    const accounts = deviceAccounts(ACCOUNTS);
    expect(accounts).toEqual([{ name: "ana@gmail.com", type: "com.google" }, { name: "+14735550101", type: "com.whatsapp" }]);
    expect(accountLabel(accounts[0])).toBe("Google account (ana@gmail.com)");
    expect(accountLabel({ name: "", type: "com.example.sync" })).toBe("com.example.sync");
    expect(deviceAccounts("Accounts: 0")).toEqual([]);
  });

  it("counts the people on the device and reads the app version", () => {
    expect(deviceUsers("Users:\n\tUserInfo{0:Owner:c13} running\n\tUserInfo{10:Guest:814}")).toEqual([{ id: 0, name: "Owner" }, { id: 10, name: "Guest" }]);
    expect(installedVersion("    versionCode=10 minSdk=22 targetSdk=36\n    versionName=1.9\n")).toBe("1.9");
    expect(installedVersion("Unable to find package: com.transittrack.app")).toBe("");
  });

  it("explains what dpm said", () => {
    expect(ownerResult(`Success: Device owner set to package ComponentInfo{${KIOSK_ADMIN}}\nActive admin set to component {…}`).ok).toBe(true);
    expect(ownerResult("java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device").code).toBe("accounts");
    expect(ownerResult("java.lang.IllegalStateException: Not allowed to set the device owner because there are already several users on the device").code).toBe("users");
    expect(ownerResult("java.lang.IllegalStateException: Trying to set the device owner, but device owner is already set.").code).toBe("owner");
    expect(ownerResult("java.lang.IllegalArgumentException: Unknown admin: ComponentInfo{com.transittrack.app/…}").code).toBe("not_installed");
    expect(ownerResult("Error: something new\n").message).toMatch(/something new/);
  });

  it("explains what the installer said", () => {
    expect(installResult("Success").ok).toBe(true);
    expect(installResult("Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.transittrack.app signatures do not match]").code).toBe("signature");
    expect(installResult("Failure [INSTALL_FAILED_VERSION_DOWNGRADE]").code).toBe("older");
    expect(installResult("Failure [INSTALL_PARSE_FAILED_NOT_APK]").code).toBe("bad_file");
  });
});

describe("what's in the way", () => {
  const base = { api: 29, release: "10", version: "1.9", owner: "", accounts: [], users: [{ id: 0, name: "Owner" }] };

  it("is ready to take ownership only with the app, no accounts, one user and Android 8+", () => {
    expect(canTakeOwnership(base)).toBe(true);
    expect(canTakeOwnership({ ...base, version: "" })).toBe(false);
    expect(canTakeOwnership({ ...base, api: 25 })).toBe(false);
    expect(canTakeOwnership({ ...base, accounts: [{ name: "a@b.c", type: "com.google" }] })).toBe(false);
    expect(canTakeOwnership({ ...base, users: [{ id: 0 }, { id: 10 }] })).toBe(false);
    expect(canTakeOwnership({ ...base, owner: "com.freekiosk" })).toBe(false);
  });

  it("names the accounts to remove, and never offers to take over from another owner", () => {
    const items = readiness({ ...base, accounts: [{ name: "ana@gmail.com", type: "com.google" }] });
    expect(items.find((i) => i.key === "accounts")).toMatchObject({ ok: false, detail: expect.stringContaining("Google account (ana@gmail.com)") });
    const other = readiness({ ...base, owner: "com.freekiosk" });
    expect(other.find((i) => i.key === "owner")).toMatchObject({ ok: false, title: expect.stringContaining("com.freekiosk") });
    expect(other.some((i) => i.key === "accounts")).toBe(false);
    expect(readiness({ ...base, owner: KIOSK_PACKAGE }).find((i) => i.key === "owner").ok).toBe(true);
  });

  it("turns browser errors into next steps", () => {
    expect(connectProblem({ name: "DeviceBusyError", message: "The device is already in use" })).toMatch(/Android Studio/);
    expect(connectProblem({ name: "NotFoundError", message: "No device selected." })).toMatch(/pick the phone/);
    expect(connectProblem(new Error("weird"))).toMatch(/USB debugging/);
  });
});
