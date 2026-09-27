// Loads live pages and reports console errors, failed requests and visible text.
import { chromium } from "@playwright/test";

const base = process.argv[2] || "https://eager-transit-track-go.base44.app";
const paths = (process.argv[3] || "/,/login,/admin,/driver,/kiosk").split(",");

const browser = await chromium.launch();
for (const p of paths) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
  page.on("requestfailed", (r) => errors.push("reqfail: " + r.url().slice(0, 150) + " " + (r.failure()?.errorText || "")));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url().slice(0, 150)}`); });
  let status = "";
  try {
    const resp = await page.goto(base + p, { waitUntil: "networkidle", timeout: 30000 });
    status = resp ? resp.status() : "no-response";
  } catch (e) { status = "goto-error: " + String(e).slice(0, 200); }
  await page.waitForTimeout(3000);
  const text = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).replace(/\s+/g, " ").slice(0, 250);
  console.log(`\n== ${p}  status=${status}  url=${page.url()}`);
  console.log("text:", text || "(blank)");
  errors.slice(0, 12).forEach((e) => console.log("  " + e));
  await ctx.close();
}
await browser.close();
