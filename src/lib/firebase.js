import { nativePushPlatform, nativePushPermission, requestNativePush, nativeForegroundMessage } from "@/lib/nativePush";
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

// Public web config — safe to ship client-side (this is how every Firebase
// web app works; it identifies the project, it isn't a secret). The private
// key that actually authorizes SENDING pushes lives only in the backend,
// stored as a Base44 secret.
const firebaseConfig = {
  apiKey: "AIzaSyA_OQ42LeGReLlt47QHJrHEzYRDDKbcZmM",
  authDomain: "transit-track-1e9e4.firebaseapp.com",
  projectId: "transit-track-1e9e4",
  storageBucket: "transit-track-1e9e4.firebasestorage.app",
  messagingSenderId: "411225112950",
  appId: "1:411225112950:web:3619f961f6d7bd00453a57",
  measurementId: "G-K2PZT8DPF5",
};

// Public VAPID key (the "Web Push certificate" from Firebase Cloud
// Messaging settings) — identifies this app to the browser's push service.
const VAPID_KEY = "BCHqJA4B0A3ikjyw2B_EgOYiJvo6UT_lNALRl1lh_46jMevS5_BaqvkwEQ56x1MmeEVWqpYRBYaIo-3n62k1TRM";

const firebaseApp = initializeApp(firebaseConfig);

/**
 * Gets this device's push token, saying why when it can't. Never throws.
 * reason: null (ok) | "unsupported" | "denied" | "dismissed" | "no_token" | "error".
 *
 * Permission is asked first, straight from the tap that called this: Safari
 * (and iPhone home-screen apps) ignore a prompt that comes after other
 * awaited work. With { prompt: false } it never asks, only reuses a grant.
 */
export async function requestPushToken({ prompt = true } = {}) {
  if (nativePushPlatform()) return requestNativePush({ prompt });
  try {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return { token: null, reason: "unsupported" };
    let permission = Notification.permission;
    if (permission === "default" && prompt) permission = await Notification.requestPermission();
    if (permission === "denied") return { token: null, reason: "denied" };
    if (permission !== "granted") return { token: null, reason: "dismissed" };
    const supported = await isSupported().catch(() => false);
    if (!supported) return { token: null, reason: "unsupported" };
    // One service worker for the whole site: offline support + push (sw.js imports the Firebase part).
    const registration = await navigator.serviceWorker.register("/sw.js");
    const token = await getToken(getMessaging(firebaseApp), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    return token ? { token, reason: null } : { token: null, reason: "no_token" };
  } catch {
    return { token: null, reason: "error" };
  }
}

/** The device token, or null when push isn't available (see requestPushToken). */
export async function getFcmToken(options) {
  return (await requestPushToken(options)).token;
}

/** Fires `callback(payload)` for pushes that arrive while the tab is open and focused. */
export function onForegroundMessage(callback) {
  if (nativePushPlatform()) return nativeForegroundMessage(callback);
  let stop = null, cancelled = false;
  isSupported()
    .then((supported) => {
      if (!supported || cancelled) return;
      stop = onMessage(getMessaging(firebaseApp), callback);
    })
    .catch(() => {});
  // Returns an unsubscribe, so a page that re-renders doesn't stack listeners.
  return () => { cancelled = true; stop?.(); };
}

export async function pushPermission() {
 if(nativePushPlatform())return nativePushPermission();
 return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
