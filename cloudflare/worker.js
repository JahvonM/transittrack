// Cloudflare runs this only for a request that matches no file and isn't a
// page being opened. Real files are served without running it, and a page
// being opened (Sec-Fetch-Mode: navigate) still gets the app (index.html)
// straight from the assets.
//
// A build file (/assets/...) this version doesn't have now answers "not
// found". It used to get the app's page with status 200, which a browser
// still on an older version then tried to run as a script ("Failed to fetch
// dynamically imported module"). Every other address gets what it got
// before: the assets' own answer, the app's page.
//
// A tablet app update (/native-releases/kiosk-build-<n>.apk) is passed
// through from the GitHub release of the same name (kiosk-apk.yml publishes
// it). The tablet only accepts a direct 200 from this address, and checks the
// file's size, fingerprint, version and signing key against the release
// Admin approved (base44/shared/nativeRelease.ts) before installing it.
const RELEASES = "https://github.com/JahvonM/transittrack/releases/download/";
const RELEASE_FILE = /^\/native-releases\/(kiosk-build-[0-9]{1,9})\.apk$/;
const plain = (body, status) => new Response(body, {
  status,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
});

async function tabletRelease(request, id) {
  if (request.method !== "GET" && request.method !== "HEAD") return plain("Method not allowed", 405);
  const upstream = await fetch(RELEASES + id + "/" + id + ".apk", {
    method: request.method,
    headers: { "User-Agent": "mcsweenstransport-app", Accept: "application/octet-stream" },
    redirect: "follow",
  }).catch(() => null);
  if (!upstream?.ok) return plain("Not found", 404);
  const headers = {
    "Content-Type": "application/vnd.android.package-archive",
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  const length = upstream.headers.get("content-length");
  if (length && /^[0-9]+$/.test(length)) headers["Content-Length"] = length;
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/")) return plain("Not found", 404);
    if (path.startsWith("/native-releases/")) {
      const match = RELEASE_FILE.exec(path);
      return match ? tabletRelease(request, match[1]) : plain("Not found", 404);
    }
    return env.ASSETS.fetch(request);
  },
};
