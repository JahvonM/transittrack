import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fb = vi.hoisted(() => ({ supported: true, token: "tok-1", getTokenError: null, unsub: vi.fn(), listeners: 0 }));
vi.mock("firebase/app", () => ({ initializeApp: () => ({}) }));
vi.mock("firebase/messaging", () => ({
  isSupported: async () => fb.supported,
  getMessaging: () => ({}),
  getToken: async () => { if (fb.getTokenError) throw fb.getTokenError; return fb.token; },
  onMessage: () => { fb.listeners += 1; return fb.unsub; },
}));
import { requestPushToken, onForegroundMessage } from "@/lib/firebase";

function browser(permission, answer = permission) {
  const Notification = { permission, requestPermission: vi.fn(async () => { Notification.permission = answer; return answer; }) };
  vi.stubGlobal("window", { Notification });
  vi.stubGlobal("Notification", Notification);
  vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn(async () => ({})) } });
  return Notification;
}
beforeEach(() => Object.assign(fb, { supported: true, token: "tok-1", getTokenError: null, listeners: 0 }));
afterEach(() => { vi.unstubAllGlobals(); fb.unsub.mockClear(); });

describe("push registration", () => {
  it("asks for permission before any other async work and returns the token", async () => {
    const N = browser("default", "granted");
    expect(await requestPushToken()).toEqual({ token: "tok-1", reason: null });
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
  });
  it("names each failure instead of always blaming permission", async () => {
    browser("denied");
    expect((await requestPushToken()).reason).toBe("denied");
    browser("default", "default");
    expect((await requestPushToken()).reason).toBe("dismissed");
    browser("granted"); fb.supported = false;
    expect((await requestPushToken()).reason).toBe("unsupported");
    browser("granted"); fb.supported = true; fb.getTokenError = new Error("network");
    expect((await requestPushToken()).reason).toBe("error");
    browser("granted"); fb.getTokenError = null; fb.token = "";
    expect((await requestPushToken()).reason).toBe("no_token");
  });
  it("never prompts on the quiet re-registration path", async () => {
    const N = browser("default", "granted");
    expect((await requestPushToken({ prompt: false })).reason).toBe("dismissed");
    expect(N.requestPermission).not.toHaveBeenCalled();
  });
  it("reports unsupported when the browser has no Notification API", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect((await requestPushToken()).reason).toBe("unsupported");
  });
  it("foreground listener can be removed, so re-renders don't stack duplicates", async () => {
    browser("granted");
    const stop = onForegroundMessage(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(fb.listeners).toBe(1);
    stop();
    expect(fb.unsub).toHaveBeenCalledTimes(1);
    const stopEarly = onForegroundMessage(() => {});
    stopEarly();
    await new Promise((r) => setTimeout(r, 0));
    expect(fb.listeners).toBe(1);
  });
});
