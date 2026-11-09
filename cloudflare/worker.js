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
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/assets/")) {
      return new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
