// TransitTrack service worker: lets the app open with no WiFi, and handles
// push notifications (the Firebase part lives in firebase-messaging-sw.js).
//
// - Pages: network first (so a new deploy shows up straight away), falling
//   back to the saved copy of the app when there's no connection.
// - App files (/assets/*): the whole build is saved in the background, so
//   every screen - including ones not opened yet - works offline.
// - Live data (/api, /functions) is never cached here; screens keep their
//   own saved copies and upload queued work when back online.
// Push comes from Google's servers. If they can't be reached while this
// worker installs, offline support must still install, so a failure here
// only turns push off until the next update.
try { importScripts("/firebase-messaging-sw.js"); } catch { /* push unavailable for now */ }

const VERSION = "1";
const SHELL = "tt-shell-v" + VERSION;
const ASSETS = "tt-assets-v" + VERSION;
const RUNTIME = "tt-runtime-v" + VERSION;
const NAV_TIMEOUT_MS = 4000;
const FIRST_NAV_TIMEOUT_MS = 30000;
const STATIC_FILES = ["/images/boarding-coast.webp", "/images/boarding-coaster.webp", "/manifest.webmanifest", "/brand/icon.svg", "/brand/favicon-32.png", "/brand/apple-touch-icon.png", "/brand/icon-192.png"];

// A version is only switched to once it's complete: the new page and every
// file it (or any screen) needs must all be saved first. Until then the
// saved copy stays on the last version that fully worked, so a tablet that
// loses signal half-way through an update still opens.
let lastCheck = 0;
let lastHtml = "";
let staging = null;

const assetRefs = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((m) => m[1]);

async function stage(html) {
  const cache = await caches.open(ASSETS);
  let files = [];
  try {
    const res = await fetch("/offline-manifest.json", { cache: "no-store" });
    if (res.ok) files = (await res.json()).files || [];
  } catch { /* offline: the page's own files are still required below */ }
  const wanted = new Set([...assetRefs(html), ...files.map((f) => "/" + f.replace(/^\//, "")), ...STATIC_FILES]);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  let missing = 0;
  for (const path of wanted) {
    if (have.has(path)) continue;
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (r.ok) await cache.put(path, r); else missing++;
    } catch { missing++; }
  }
  if (missing) return false; // keep the last working version; try again later
  const shell = await caches.open(SHELL);
  await shell.put("/", new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  // Only now drop files the new version no longer uses.
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p.startsWith("/assets/") && !wanted.has(p)) await cache.delete(req);
  }
  return true;
}

// Saves `html` (the page just served) as the offline copy once all of its
// files are saved. A new version is staged straight away; the same version
// is re-checked at most every 10 minutes. One run at a time.
function update(html, { force = false } = {}) {
  if (staging) return staging;
  if (!force && html === lastHtml && Date.now() - lastCheck < 10 * 60 * 1000) return Promise.resolve(true);
  staging = (async () => {
    try {
      const ok = await stage(html);
      if (ok) { lastHtml = html; lastCheck = Date.now(); }
      return ok;
    } catch { return false; }
    finally { staging = null; }
  })();
  return staging;
}

async function htmlOf(response) {
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !type.includes("text/html")) return null;
  return response.text();
}

async function fetchAndStage({ force = false } = {}) {
  const html = await htmlOf(await fetch("/", { cache: "no-store" }));
  return html ? update(html, { force }) : false;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(fetchAndStage({ force: true }).catch(() => false));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS, RUNTIME]);
    for (const name of await caches.keys()) if (name.startsWith("tt-") && !keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

// Tablets ask for the new version to be fully saved before they reload into
// it (src/lib/tabletUpdate.js), so an update never leaves them half-way.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "tt-stage-update") return;
  const port = event.ports?.[0];
  event.waitUntil(fetchAndStage({ force: true }).catch(() => false).then((ok) => port?.postMessage({ ok })));
});

// The short deadline is for switching to a SAVED app, not for deciding that
// a first-time device has no internet. Keep the original network request
// alive so a slow response can still finish saving the app in the background.
async function withDeadline(request, ms) {
  let timer;
  try {
    return await Promise.race([request, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    })]);
  } finally { clearTimeout(timer); }
}

function connectionRecovery() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#091116"><title>Connecting · McSween Transport</title></head><body style="font-family:system-ui,sans-serif;background:#091116;color:#f1f4ee;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box"><main style="max-width:440px;text-align:center"><h1>Let’s get connected</h1><p style="color:#aebec5;line-height:1.7">McSween Transport couldn’t finish loading. Your connection may still be starting. Check Wi-Fi or mobile data, then try again.</p><button id="retry" style="background:#d6f54a;color:#14200b;border:0;border-radius:14px;padding:16px 28px;font:inherit;font-weight:700;min-height:48px">Try again</button><p style="font-size:13px;color:#aebec5">Saved records and tablet pairing have not been cleared.</p></main><script>document.getElementById('retry').onclick=()=>location.reload();window.addEventListener('online',()=>location.reload(),{once:true});</script></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

async function page(event) {
  const network = fetch(event.request);
  // Register background work before waiting for a deadline. A slow network
  // success must still stage its files after the saved screen has opened.
  event.waitUntil(network.then(response => htmlOf(response.clone()))
    .then(html => html && update(html)).catch(() => {}));
  const cached = await caches.match("/", { cacheName: SHELL }).catch(() => null);
  try {
    const response = await withDeadline(network, cached ? NAV_TIMEOUT_MS : FIRST_NAV_TIMEOUT_MS);
    if (response.ok) return response;
    return cached || connectionRecovery();
  } catch {
    // Background staging may have completed while the connection was waiting.
    return cached || await caches.match("/", { cacheName: SHELL }).catch(() => null) || connectionRecovery();
  }
}

async function cacheFirst(request, cacheName) {
  // ignoreVary: app files are saved with a plain request, but scripts load
  // with an Origin header; a "Vary: Origin" reply would never match offline.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone())
      .then(async () => {
        if (cacheName !== RUNTIME) return;
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - 300; i++) await cache.delete(keys[i]); // keep the newest 300
      })
      .catch(() => {});
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
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/") || url.pathname === "/manifest.webmanifest" || STATIC_FILES.includes(url.pathname)) {
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
