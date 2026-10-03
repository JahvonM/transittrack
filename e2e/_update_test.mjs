// Tablet updates: a boarding tablet reloads after "Send update" once it has
// been untouched for 90 s, and by itself when a newer version is published
// while it's charging — but not while someone is using it.
import { chromium } from "@playwright/test";
const base = process.argv[2] || "http://localhost:4173";
const ok = (l, v) => console.log((v ? "PASS " : "FAIL ") + l);

async function run({ requestOffsetMs = null, newerBuild = false, charging = false, keepTouching = false }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 } });
  await ctx.addInitScript(({ charging }) => {
    localStorage.setItem("tt_kiosk_device_id", "k1");
    localStorage.setItem("tt_kiosk_device", JSON.stringify({ device_id: "k1", kiosk_type: "bus_boarding", label: "Bus 12 boarding", vehicle_name: "Bus 12" }));
    window.__ttHelperHealth = { charging };
  }, { charging });
  let loads = 0;
  await ctx.route("**/offline-manifest.json*", async (r) => {
    const res = await r.fetch();
    const m = await res.json();
    if (newerBuild) m.build = "2099-01-01 00:00";
    return r.fulfill({ json: m });
  });
  await ctx.route("**/api/**", async (r) => {
    const url = r.request().url();
    if (url.includes("public-settings")) return r.continue();
    if (url.includes("kioskHeartbeat")) {
      return r.fulfill({ json: { ok: true, device_id: "k1", label: "Bus 12 boarding", kiosk_type: "bus_boarding", vehicle_id: "v1", vehicle_name: "Bus 12", paired: true,
        update_requested_at: requestOffsetMs == null ? null : new Date(Date.now() + requestOffsetMs).toISOString() } });
    }
    if (url.includes("kioskCheckIn")) return r.fulfill({ json: { staff: [] } });
    return r.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  page.on("load", () => { loads++; });
  await page.clock.install();
  await page.goto(base + "/kiosk");
  await page.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) {
    if (keepTouching) await page.mouse.click(5, 5);
    await page.clock.runFor(40 * 1000);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  await browser.close();
  return loads;
}

ok("Send update → reloads when idle", (await run({ requestOffsetMs: 20000 })) >= 2);
ok("Send update → waits while someone is using it", (await run({ requestOffsetMs: 20000, keepTouching: true })) === 1);
ok("old request (before the page opened) ignored", (await run({ requestOffsetMs: -60000 })) === 1);
ok("newer version + charging + idle → reloads", (await run({ newerBuild: true, charging: true })) >= 2);
ok("newer version but not charging → stays", (await run({ newerBuild: true, charging: false })) === 1);
ok("same version + charging → stays", (await run({ charging: true })) === 1);
