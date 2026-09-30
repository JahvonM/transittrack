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
 * Requests notification permission, registers the FCM service worker, and
 * returns a device token — or null if push isn't supported (older Safari,
 * private browsing, etc.) or the user declines permission. Never throws.
 */
export async function getFcmToken() {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
    const supported = await isSupported().catch(() => false);
    if (!supported) return null;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    // One service worker for the whole site: offline support + push (sw.js imports the Firebase part).
    const registration = await navigator.serviceWorker.register("/sw.js");
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    return token || null;
  } catch {
    return null;
  }
}

/** Fires `callback(payload)` for pushes that arrive while the tab is open and focused. */
export function onForegroundMessage(callback) {
  isSupported()
    .then((supported) => {
      if (!supported) return;
      onMessage(getMessaging(firebaseApp), callback);
    })
    .catch(() => {});
}
