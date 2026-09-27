// Ad-hoc visual check: screenshots public + device screens from a live URL.
// Usage: node e2e/screenshots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";

const base = process.argv[2] || "https://eager-transit-track-go.base44.app";
const out = process.argv[3] || "/tmp/shots";

const shots = [
  { name: "welcome", path: "/", viewport: { width: 390, height: 844 } },
  { name: "login", path: "/login", viewport: { width: 390, height: 844 } },
  { name: "kiosk", path: "/kiosk", viewport: { width: 1194, height: 834 }, storage: { tt_kiosk_device_id: "6ab72f96a01e01329ada39dc" } },
  { name: "driver", path: "/driver", viewport: { width: 390, height: 844 }, storage: { tt_driver_device_id: "6ab72f96a01e01329ada39dd" } },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 1 });
  if (s.storage) {
    await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, s.storage);
  }
  const page = await ctx.newPage();
  await page.goto(base + s.path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${s.name}.jpg`, type: "jpeg", quality: 70 });
  console.log("shot", s.name);
  await ctx.close();
}
await browser.close();
