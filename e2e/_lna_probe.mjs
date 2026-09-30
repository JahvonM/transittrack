// Can the live https site reach the helper on 127.0.0.1? (Chrome Local Network Access)
import { chromium } from "@playwright/test";
const base = process.argv[2] || "https://eager-transit-track-go.base44.app";
const perm = process.argv[3] === "grant";
const browser = await chromium.launch();
console.log("chromium", browser.version());
const ctx = await browser.newContext();
if (perm) {
  for (const p of ["local-network-access", "loopback-network", "local-network"]) {
    try { await ctx.grantPermissions([p], { origin: base }); console.log("granted", p); } catch (e) { console.log("grant", p, "->", String(e).split("\n")[0]); }
  }
}
const page = await ctx.newPage();
const msgs = [];
page.on("console", (m) => msgs.push(m.type() + ": " + m.text().slice(0, 200)));
await page.goto(base + "/", { waitUntil: "domcontentloaded" });
const res = await page.evaluate(async () => {
  const out = {};
  try { const r = await fetch("http://127.0.0.1:8765/status", { cache: "no-store" }); out.fetch = r.status + " " + (await r.text()).slice(0, 80); }
  catch (e) { out.fetch = "ERR " + e.message; }
  out.sse = await new Promise((resolve) => {
    const es = new EventSource("http://127.0.0.1:8765/events");
    const t = setTimeout(() => { es.close(); resolve("timeout, readyState=" + es.readyState); }, 4000);
    es.onmessage = (ev) => { clearTimeout(t); es.close(); resolve("got: " + ev.data.slice(0, 60)); };
    es.onerror = () => { clearTimeout(t); es.close(); resolve("error"); };
  });
  return out;
});
console.log(JSON.stringify(res));
console.log(msgs.filter((m) => /127\.0\.0\.1|Local Network|Private Network|CORS|blocked/i.test(m)).join("\n"));
await browser.close();
