// Captures the bus loader at a few moments in time (the page's data never
// arrives, so it keeps loading) and stacks the frames into one image.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:4173";
const theme = process.argv[3] || "dark";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 500 }, deviceScaleFactor: 2 });
await ctx.addInitScript((t) => { localStorage.setItem("base44_access_token", "fake"); localStorage.setItem("token", "fake"); localStorage.setItem("tt-theme-v2", t); }, theme);
await ctx.route("**/api/**", async (r) => {
  const url = r.request().url();
  if (url.includes("public-settings")) return r.continue();
  if (url.includes("/entities/User/me")) return r.fulfill({ json: { id: "u1", email: "t@x.com", full_name: "T", role: "staff" } });
  // never answer the company list, so the page stays on its loader
});
const page = await ctx.newPage();
await page.goto(base + "/staff", { waitUntil: "domcontentloaded" });
const loader = page.locator(".tt-loader").first();
await loader.waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const frames = [];
for (let i = 0; i < 4; i++) {
  frames.push((await loader.screenshot()).toString("base64"));
  await page.waitForTimeout(130);
}
const html = `<body style="margin:0;background:${theme === "dark" ? "#0B0B0D" : "#fff"};display:flex;flex-direction:column;gap:6px;padding:6px;width:max-content">${frames.map((b) => `<img src="data:image/png;base64,${b}" style="width:440px;display:block;outline:1px solid #f0f3">`).join("")}</body>`;
await page.setViewportSize({ width: 460, height: 4 * 190 });
await page.setContent(html);
await page.screenshot({ path: `/tmp/shots/loader_${theme}.jpg`, type: "jpeg", quality: 70, fullPage: true });
await browser.close();
console.log("ok", fs.statSync(`/tmp/shots/loader_${theme}.jpg`).size);
