// Runs in the background even when the app tab isn't open/focused — this is
// what lets a push actually show up as a phone notification. Must live at
// the site root (not under /src) so the browser can register it with the
// right scope.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA_OQ42LeGReLlt47QHJrHEzYRDDKbcZmM",
  authDomain: "transit-track-1e9e4.firebaseapp.com",
  projectId: "transit-track-1e9e4",
  storageBucket: "transit-track-1e9e4.firebasestorage.app",
  messagingSenderId: "411225112950",
  appId: "1:411225112950:web:3619f961f6d7bd00453a57",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "TransitTrack";
  const body = payload.notification?.body || "";
  self.registration.showNotification(title, {
    body,
    icon: "/brand/icon-192.png?v=hiace1",
    tag: payload.data?.type || "transit-track",
    data: payload.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
