// Card issuing reader help: helper not running -> checklist; inside an iframe -> "open in its own tab".
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch();
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);

async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); });
  await ctx.route("**/api/**", async (r) => {
    const url = r.request().url();
    if (url.includes("public-settings")) return r.continue();
    if (url.includes("/functions/nfcCards")) return r.fulfill({ json: { people: [], cards: [], vehicles: [], tablets: [] } });
    if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "a@x.com", full_name: "Ana Admin", role: "admin" } });
    if (url.includes("/entities/")) return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  await ctx.route("http://127.0.0.1:8765/**", (r) => r.abort("connectionrefused"));
  try { await ctx.grantPermissions(["local-network-access"], { origin: base }); } catch { /* ignore */ }
  return ctx;
}

// 1) Helper not running
let ctx = await context();
let page = await ctx.newPage();
await page.goto(base + "/admin/cards");
await page.getByRole("button", { name: "Connect reader" }).click();
const checklist = await page.getByText(/Can't reach the reader helper on this PC/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
ok("helper-not-running checklist shown", checklist);
ok("test-the-helper link points at the helper", await page.locator("a", { hasText: "Test the helper" }).first().getAttribute("href", { timeout: 3000 }).then((h) => h === "http://127.0.0.1:8765/").catch(() => false));
ok("button now says Try again", await page.getByRole("button", { name: "Try again" }).isVisible());
await page.screenshot({ path: "/tmp/shots/reader_offline.png" });
await ctx.close();

// 2) Inside another page (like the Base44 editor preview)
ctx = await context();
page = await ctx.newPage();
await page.goto(base + "/manifest.webmanifest").catch(() => {}); await page.goto("about:blank");
await page.setContent(`<iframe src="${base}/admin/cards" style="width:1400px;height:880px;border:0"></iframe>`);
const frame = page.frameLocator("iframe");
const framed = await frame.getByText("Open Card issuing in its own tab").waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
ok("iframe shows open-in-new-tab", framed);
ok("open button present", await frame.getByRole("button", { name: /Open in new tab/ }).isVisible().catch(() => false));
await ctx.close();
await browser.close();
