// Simulates a signed-in user (fake token + mocked User/me and empty entity
// lists) against the live build, to surface crashes on signed-in screens.
import { chromium } from "@playwright/test";

const base = process.argv[2] || "https://eager-transit-track-go.base44.app";
const role = process.argv[3] || "admin";
const paths = (process.argv[4] || "/,/admin").split(",");

const user = { id: "u1", email: "qa@example.com", full_name: "QA User", role, company_id: "c1" };

const browser = await chromium.launch();
for (const p of paths) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("base44_access_token", "fake");
    localStorage.setItem("token", "fake");
  });
  await ctx.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("public-settings")) return route.continue();
    if (url.includes("/entities/User/me")) return route.fulfill({ json: user });
    if (/\/entities\/[A-Za-z]+\/[a-z0-9]{12,}/.test(url) && route.request().method() === "GET") return route.fulfill({ json: {} });
    if (url.includes("/entities/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e.stack || e).slice(0, 500)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
  await page.goto(base + p, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => errors.push("goto " + e));
  await page.waitForTimeout(5000);
  const text = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  console.log(`\n== [${role}] ${p} -> ${page.url()}`);
  console.log("text:", text || "(blank)");
  errors.slice(0, 8).forEach((e) => console.log("  " + e));
  await ctx.close();
}
await browser.close();
