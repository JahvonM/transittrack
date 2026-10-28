import { describe, it, expect, beforeEach } from "vitest";
import {
  FIRST_OPEN_KEY, captureInstallPrompt, canPromptInstall, firstOpenWanted, installContext, installStep, markFirstOpenDone,
  onInstallChange, promptInstall, resetInstallPromptForTests,
} from "../appInstall.js";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85",
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; SM-A546B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  electron: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) McSween/2.0 Chrome/138.0.0.0 Electron/37.2.0 Safari/537.36",
};

function memoryStorage(values = {}) {
  const data = { ...values };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}
function fakeWindow({ ua = UA.iphoneSafari, touch = 5, standalone = false, displayMode = null, path = "/login", storage = memoryStorage(), webdriver = false, framed = false } = {}) {
  const win = {
    navigator: { userAgent: ua, maxTouchPoints: touch, standalone, webdriver },
    matchMedia: (q) => ({ matches: !!displayMode && q.includes(displayMode) }),
    location: { pathname: path },
    localStorage: storage,
  };
  win.self = win;
  win.top = framed ? {} : win;
  return win;
}

describe("installContext", () => {
  it("tells iPhone Safari, Chrome on iPhone and an Instagram link apart", () => {
    expect(installContext(fakeWindow({ ua: UA.iphoneSafari }))).toMatchObject({ ios: true, ipad: false, browser: "safari", standalone: false });
    expect(installContext(fakeWindow({ ua: UA.iphoneChrome })).browser).toBe("chrome");
    expect(installContext(fakeWindow({ ua: UA.iphoneInstagram })).browser).toBe("inapp");
  });
  it("finds an iPad that says it is a Mac, and leaves a real Mac alone", () => {
    expect(installContext(fakeWindow({ ua: UA.ipadSafari, touch: 5 }))).toMatchObject({ ios: true, ipad: true, browser: "safari" });
    expect(installContext(fakeWindow({ ua: UA.mac, touch: 0 }))).toMatchObject({ ios: false, ipad: false, mobile: false });
  });
  it("knows Android browsers and app web views", () => {
    expect(installContext(fakeWindow({ ua: UA.androidChrome }))).toMatchObject({ android: true, browser: "chrome", mobile: true });
    expect(installContext(fakeWindow({ ua: UA.androidSamsung })).browser).toBe("samsung");
    expect(installContext(fakeWindow({ ua: UA.androidWebView })).browser).toBe("inapp");
  });
  it("sees when it is already running as the installed app", () => {
    expect(installContext(fakeWindow({ standalone: true })).standalone).toBe(true);
    expect(installContext(fakeWindow({ ua: UA.androidChrome, displayMode: "standalone" })).standalone).toBe(true);
  });
});

describe("installStep", () => {
  const ctx = (opts) => installContext(fakeWindow(opts));
  it("walks iPhone and iPad through Safari's Share menu", () => {
    expect(installStep(ctx({ ua: UA.iphoneSafari }), false)).toBe("ios-safari");
    expect(installStep(ctx({ ua: UA.ipadSafari }), false)).toBe("ios-safari");
    expect(installStep(ctx({ ua: UA.iphoneChrome }), false)).toBe("ios-other");
    expect(installStep(ctx({ ua: UA.iphoneInstagram }), false)).toBe("inapp");
  });
  it("uses the browser's Install button on Android when there is one, else the menu steps", () => {
    expect(installStep(ctx({ ua: UA.androidChrome }), true)).toBe("prompt");
    expect(installStep(ctx({ ua: UA.androidChrome }), false)).toBe("android-menu");
  });
  it("skips it when installed already, or on a computer that can't install", () => {
    expect(installStep(ctx({ standalone: true }), true)).toBe(null);
    expect(installStep(ctx({ ua: UA.windowsChrome, touch: 0 }), false)).toBe(null);
    expect(installStep(ctx({ ua: UA.windowsChrome, touch: 0 }), true)).toBe("prompt");
  });
});

describe("firstOpenWanted", () => {
  it("shows once, until it is closed", () => {
    const storage = memoryStorage();
    expect(firstOpenWanted({ win: fakeWindow({ storage }), native: false })).toBe(true);
    markFirstOpenDone(storage);
    expect(storage.data[FIRST_OPEN_KEY]).toBeTruthy();
    expect(firstOpenWanted({ win: fakeWindow({ storage }), native: false })).toBe(false);
  });
  it("never shows in the installed native apps, the desktop app, test browsers or a frame", () => {
    expect(firstOpenWanted({ win: fakeWindow(), native: true })).toBe(false);
    expect(firstOpenWanted({ win: fakeWindow({ ua: UA.electron }), native: false })).toBe(false);
    expect(firstOpenWanted({ win: fakeWindow({ webdriver: true }), native: false })).toBe(false);
    expect(firstOpenWanted({ win: fakeWindow({ framed: true }), native: false })).toBe(false);
  });
  it("leaves the bus tablets, ride links and sign-in hand-offs alone", () => {
    for (const path of ["/kiosk", "/tablet", "/driver", "/driver/stops", "/track", "/desktop-signin", "/phone-signin", "/oauth/consent", "/privacy", "/terms", "/site/book", "/reviewer-sandbox"]) {
      expect(firstOpenWanted({ win: fakeWindow({ path }), native: false }), path).toBe(false);
    }
    for (const path of ["/", "/login", "/register", "/staff", "/driver-phone", "/admin", "/join"]) {
      expect(firstOpenWanted({ win: fakeWindow({ path }), native: false }), path).toBe(true);
    }
  });
  it("doesn't show where it couldn't remember being closed", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(firstOpenWanted({ win: fakeWindow({ storage: blocked }), native: false })).toBe(false);
  });
});

describe("the browser's install offer", () => {
  beforeEach(() => resetInstallPromptForTests());
  function eventTarget() {
    const handlers = {};
    return { addEventListener: (type, fn) => { handlers[type] = fn; }, fire: (type, event) => handlers[type]?.(event) };
  }
  it("keeps the offer, suppresses the browser's banner and reports the answer", async () => {
    const win = eventTarget();
    captureInstallPrompt(win);
    let changes = 0;
    onInstallChange(() => { changes += 1; });
    let prevented = false, prompted = false;
    win.fire("beforeinstallprompt", { preventDefault: () => { prevented = true; }, prompt: async () => { prompted = true; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    expect(prevented).toBe(true);
    expect(canPromptInstall()).toBe(true);
    expect(await promptInstall()).toBe("accepted");
    expect(prompted).toBe(true);
    // An offer can only be used once.
    expect(canPromptInstall()).toBe(false);
    expect(await promptInstall()).toBe("unavailable");
    expect(changes).toBeGreaterThanOrEqual(2);
  });
  it("forgets the offer once the app is installed another way", () => {
    const win = eventTarget();
    captureInstallPrompt(win);
    win.fire("beforeinstallprompt", { preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    win.fire("appinstalled", {});
    expect(canPromptInstall()).toBe(false);
  });
});
