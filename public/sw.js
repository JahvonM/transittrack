// TransitTrack service worker: lets the app open with no WiFi, and handles
// push notifications (the Firebase part lives in firebase-messaging-sw.js).
//
// - Pages: network first (so a new deploy shows up straight away), falling
//   back to the saved copy of the app when there's no connection.
// - App files (/assets/*): the whole build is saved in the background, so
//   every screen - including ones not opened yet - works offline.
// - Live data (/api, /functions) is never cached here; screens keep their
//   own saved copies and upload queued work when back online.
importScripts("/firebase-messaging-sw.js");

const VERSION = "1";
const SHELL = "tt-shell-v" + VERSION;
const ASSETS = "tt-assets-v" + VERSION;
const RUNTIME = "tt-runtime-v" + VERSION;
const NAV_TIMEOUT_MS = 4000;
const STATIC_FILES = ["/manifest.webmanifest", "/brand/icon.svg", "/brand/favicon-32.png", "/brand/apple-touch-icon.png", "/brand/icon-192.png"];

let lastPrecache = 0;

async function precache() {
  if (Date.now() - lastPrecache < 10 * 60 * 1000) return;
  lastPrecache = Date.now();
  const res = await fetch("/offline-manifest.json", { cache: "no-store" });
  if (!res.ok) return;
  const { files = [] } = await res.json();
  const wanted = new Set(files.map((f) => "/" + f.replace(/^\//, "")).concat(STATIC_FILES));
  const cache = await caches.open(ASSETS);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  for (const path of wanted) {
    if (have.has(path)) continue;
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (r.ok) await cache.put(path, r);
    } catch { /* try again next time */ }
  }
  // Drop files from older builds once the new ones are saved.
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p.startsWith("/assets/") && !wanted.has(p)) await cache.delete(req);
  }
}

async function saveShell(response) {
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !type.includes("text/html")) return;
  const cache = await caches.open(SHELL);
  await cache.put("/", response);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try { await saveShell(await fetch("/", { cache: "no-store" })); } catch { /* offline */ }
    lastPrecache = 0;
    try { await precache(); } catch { /* offline */ }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS, RUNTIME]);
    for (const name of await caches.keys()) if (name.startsWith("tt-") && !keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function page(event) {
  try {
    const response = await Promise.race([fetch(event.request), timeout(NAV_TIMEOUT_MS)]);
    event.waitUntil(saveShell(response.clone()).then(() => precache()).catch(() => {}));
    return response;
  } catch {
    const cached = await caches.match("/", { cacheName: SHELL });
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:sans-serif;background:#0b0b0d;color:#fff;display:grid;place-items:center;height:100vh;margin:0'><p>TransitTrack needs a connection the first time it opens on this device.</p>",
      { status: 503, headers: { "Content-Type": "text/html" } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/functions/")) return;
    if (req.mode === "navigate") { event.respondWith(page(event)); return; }
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/") || url.pathname === "/manifest.webmanifest") {
      event.respondWith(cacheFirst(req, ASSETS));
    }
    return;
  }
  // Fonts and people's photos: keep a copy once seen.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || req.destination === "image") {
    if (url.hostname.includes("mapbox")) return; // map tiles are handled by the map itself
    event.respondWith(cacheFirst(req, RUNTIME).catch(() => fetch(req)));
  }
});
