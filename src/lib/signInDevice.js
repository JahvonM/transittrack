// The "New sign-in" email (accountEmails → signed_in). This browser keeps a
// random id of its own; after each sign-in the app tells the server once per
// browser session, with a plain description such as "Safari on an iPhone".
// The server keeps only a hash of the id and decides whether to email.
const ID_KEY = "tt_device_id";
const NOTED = "tt_sign_in_noted:";

export function deviceId() {
  try {
    let id = localStorage.getItem(ID_KEY) || "";
    if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = (globalThis.crypto?.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch { return ""; }
}

// "Safari on an iPhone", "the app on an Android phone", "Chrome on a Windows computer"…
export function deviceLabel(ua = "", app = false) {
  const device = /iPhone/.test(ua) ? "an iPhone" : /iPad/.test(ua) ? "an iPad"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "an Android phone" : "an Android tablet")
      : /CrOS/.test(ua) ? "a Chromebook" : /Windows/.test(ua) ? "a Windows computer"
        : /Macintosh|Mac OS X/.test(ua) ? "a Mac" : /Linux/.test(ua) ? "a Linux computer" : "a phone or computer";
  const browser = app ? "the app" : /EdgA?\/|EdgiOS/.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /OPR\//.test(ua) ? "Opera" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome"
      : /Safari\//.test(ua) ? "Safari" : "a browser";
  return `${browser} on ${device}`;
}

function inApp() {
  try { return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; }
}

export async function noteSignIn(invoke, userId) {
  const id = deviceId();
  if (!id || !userId) return false;
  try { if (sessionStorage.getItem(NOTED + userId)) return false; sessionStorage.setItem(NOTED + userId, "1"); } catch { /* ask anyway */ }
  try { await invoke({ action: "signed_in", device_id: id, device: deviceLabel(navigator.userAgent || "", inApp()) }); return true; }
  catch { try { sessionStorage.removeItem(NOTED + userId); } catch { /* next time */ } return false; }
}
